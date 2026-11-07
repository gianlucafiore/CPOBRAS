//! Public print identity and consistent, exact snapshots for client/internal reports.
use crate::{budget_tools::BudgetDocument, estimates::Estimate, LocalStore, Result, StorageError};
use cpobras_core::{price_determination::PriceResult, Client, Project};
use rusqlite::{params, OptionalExtension};
use rust_decimal::{Decimal as D, RoundingStrategy};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default, deny_unknown_fields)]
pub struct PrintProfile {
    pub company_name: String,
    pub trade_name: String,
    pub professional_name: String,
    pub qualification: String,
    pub tax_id: String,
    pub address: String,
    pub phone: String,
    pub email: String,
    pub website: String,
    pub footer: String,
    pub logo_png: Vec<u8>,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct SavedPrintProfile {
    pub revision: u32,
    pub profile: PrintProfile,
}
#[derive(Debug, Serialize)]
pub struct PrintLine {
    pub id: Uuid,
    pub direct_total: D,
    pub sale_total: D,
    pub sale_unit: D,
    pub incidence_percent: D,
    pub cumulative_percent: D,
}
#[derive(Debug, Serialize)]
pub struct BudgetPrintData {
    pub document: BudgetDocument,
    pub estimate: Estimate,
    pub project: Project,
    pub client: Client,
    pub profile: PrintProfile,
    pub calculation: PriceResult,
    pub lines: Vec<PrintLine>,
    pub final_total: D,
    pub unallocated_total: D,
}
fn invalid(s: &str) -> StorageError {
    StorageError::InvalidValue(s.into())
}
fn checked(value: Option<D>) -> Result<D> {
    value.ok_or_else(|| invalid("Importe fuera del rango decimal al preparar la impresión"))
}
fn round(value: D, scale: u32) -> D {
    value.round_dp_with_strategy(scale, RoundingStrategy::MidpointAwayFromZero)
}
impl PrintProfile {
    pub fn validate(&self) -> Result<()> {
        if self.company_name.trim().is_empty() && self.professional_name.trim().is_empty() {
            return Err(invalid("Completá el nombre de empresa o profesional"));
        }
        if [
            &self.company_name,
            &self.trade_name,
            &self.professional_name,
            &self.qualification,
            &self.tax_id,
            &self.address,
            &self.phone,
            &self.email,
            &self.website,
        ]
        .iter()
        .any(|s| s.len() > 500)
            || self.footer.len() > 2000
        {
            return Err(invalid("Datos públicos demasiado extensos"));
        }
        if !self.logo_png.is_empty() {
            let b = &self.logo_png;
            if b.len() > 512_000
                || b.len() < 33
                || !b.starts_with(b"\x89PNG\r\n\x1a\n")
                || &b[12..16] != b"IHDR"
            {
                return Err(invalid("El logotipo debe ser PNG y ocupar hasta 512 KB"));
            }
            let w = u32::from_be_bytes(b[16..20].try_into().unwrap());
            let h = u32::from_be_bytes(b[20..24].try_into().unwrap());
            if w == 0 || h == 0 || w > 2048 || h > 2048 {
                return Err(invalid(
                    "Dimensiones del logotipo inválidas (máximo 2048 px)",
                ));
            }
        }
        Ok(())
    }
}
impl LocalStore {
    pub fn get_print_profile(&self) -> Result<SavedPrintProfile> {
        let row: Option<(u32, String)> = self
            .conn
            .query_row(
                "SELECT revision,profile_json FROM print_profiles WHERE id='default'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        match row {
            Some((revision, json)) => Ok(SavedPrintProfile {
                revision,
                profile: serde_json::from_str(&json)?,
            }),
            None => Ok(SavedPrintProfile {
                revision: 0,
                profile: PrintProfile::default(),
            }),
        }
    }
    pub fn save_print_profile(
        &mut self,
        revision: u32,
        profile: &PrintProfile,
    ) -> Result<SavedPrintProfile> {
        profile.validate()?;
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let current: u32 = tx.query_row(
            "SELECT COALESCE((SELECT revision FROM print_profiles WHERE id='default'),0)",
            [],
            |r| r.get(0),
        )?;
        if current != revision {
            return Err(invalid(
                "Los datos de impresión cambiaron. Recargá antes de guardar",
            ));
        }
        let revision = revision
            .checked_add(1)
            .ok_or_else(|| invalid("Revisión fuera de rango"))?;
        tx.execute("INSERT INTO print_profiles(id,revision,profile_json) VALUES ('default',?1,?2) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,profile_json=excluded.profile_json",params![revision,serde_json::to_string(profile)?])?;
        tx.commit()?;
        Ok(SavedPrintProfile {
            revision,
            profile: profile.clone(),
        })
    }
    pub fn budget_print_data(&self, id: Uuid) -> Result<BudgetPrintData> {
        let tx = self.conn.unchecked_transaction()?;
        let estimate = self
            .get_estimate(id)?
            .ok_or_else(|| invalid("Presupuesto inexistente"))?;
        let project = self
            .get_project(estimate.project_id)?
            .ok_or_else(|| invalid("Obra inexistente"))?;
        let client = self
            .get_client(project.client_id)?
            .ok_or_else(|| invalid("Cliente inexistente"))?;
        let document = self.export_budget(id)?;
        let calculation = crate::price_determination::calculate_price(&tx, id)?;
        let profile = self.get_print_profile()?.profile;
        let final_total = round(calculation.breakdown.total, 2);
        let direct = calculation.breakdown.direct;
        let mut lines = vec![];
        let (mut cost_so_far, mut sale_so_far, mut percent_so_far) = (D::ZERO, D::ZERO, D::ZERO);
        for l in &document.lines {
            let cost = checked(l.quantity.checked_mul(l.unit_cost_snapshot))?;
            cost_so_far = checked(cost_so_far.checked_add(cost))?;
            let cumulative = if direct == D::ZERO {
                D::ZERO
            } else if cost_so_far == direct {
                final_total
            } else {
                round(
                    checked(checked(cost_so_far.checked_div(direct))?.checked_mul(final_total))?,
                    2,
                )
            };
            let sale = checked(cumulative.checked_sub(sale_so_far))?;
            sale_so_far = cumulative;
            let cumulative_percent = if final_total == D::ZERO {
                D::ZERO
            } else if cumulative == final_total {
                D::from(100)
            } else {
                round(
                    checked(
                        checked(cumulative.checked_div(final_total))?.checked_mul(D::from(100)),
                    )?,
                    4,
                )
            };
            let incidence = checked(cumulative_percent.checked_sub(percent_so_far))?;
            percent_so_far = cumulative_percent;
            let unit = if l.quantity == D::ZERO {
                D::ZERO
            } else {
                checked(sale.checked_div(l.quantity))?
            };
            lines.push(PrintLine {
                id: l.id,
                direct_total: cost,
                sale_total: sale,
                sale_unit: unit,
                incidence_percent: incidence,
                cumulative_percent,
            });
        }
        let unallocated_total = checked(final_total.checked_sub(sale_so_far))?;
        tx.commit()?;
        Ok(BudgetPrintData {
            document,
            estimate,
            project,
            client,
            profile,
            calculation,
            lines,
            final_total,
            unallocated_total,
        })
    }
}
