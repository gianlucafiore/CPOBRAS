//! Decimal formulas, nested analyses, explicit FX and sensitivity scenarios.
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;

pub fn evaluate_formula(
    expression: &str,
    variables: &BTreeMap<String, Decimal>,
) -> Result<Decimal, String> {
    struct Parser<'a> {
        bytes: &'a [u8],
        position: usize,
        vars: &'a BTreeMap<String, Decimal>,
        depth: u32,
    }
    impl Parser<'_> {
        fn space(&mut self) {
            while self
                .bytes
                .get(self.position)
                .is_some_and(|c| c.is_ascii_whitespace())
            {
                self.position += 1;
            }
        }
        fn take(&mut self, c: u8) -> bool {
            self.space();
            if self.bytes.get(self.position) == Some(&c) {
                self.position += 1;
                true
            } else {
                false
            }
        }
        fn expression(&mut self) -> Result<Decimal, String> {
            let mut value = self.term()?;
            loop {
                if self.take(b'+') {
                    value = value.checked_add(self.term()?).ok_or("Desborde decimal")?;
                } else if self.take(b'-') {
                    value = value.checked_sub(self.term()?).ok_or("Desborde decimal")?;
                } else {
                    return Ok(value);
                }
            }
        }
        fn term(&mut self) -> Result<Decimal, String> {
            let mut value = self.atom()?;
            loop {
                if self.take(b'*') {
                    value = value.checked_mul(self.atom()?).ok_or("Desborde decimal")?;
                } else if self.take(b'/') {
                    value = value
                        .checked_div(self.atom()?)
                        .ok_or("División por cero o desborde")?;
                } else {
                    return Ok(value);
                }
            }
        }
        fn atom(&mut self) -> Result<Decimal, String> {
            self.depth += 1;
            if self.depth > 32 {
                return Err("Fórmula demasiado anidada".into());
            }
            let value = if self.take(b'-') {
                Decimal::ZERO
                    .checked_sub(self.atom()?)
                    .ok_or("Desborde decimal")?
            } else if self.take(b'+') {
                self.atom()?
            } else if self.take(b'(') {
                let value = self.expression()?;
                if !self.take(b')') {
                    return Err("Falta cerrar paréntesis".into());
                }
                value
            } else {
                self.space();
                let start = self.position;
                if self
                    .bytes
                    .get(start)
                    .is_some_and(|c| c.is_ascii_alphabetic() || *c == b'_')
                {
                    while self
                        .bytes
                        .get(self.position)
                        .is_some_and(|c| c.is_ascii_alphanumeric() || *c == b'_')
                    {
                        self.position += 1;
                    }
                    let name = std::str::from_utf8(&self.bytes[start..self.position])
                        .map_err(|_| "Variable inválida")?;
                    *self
                        .vars
                        .get(name)
                        .ok_or_else(|| format!("Variable no definida: {name}"))?
                } else {
                    while self
                        .bytes
                        .get(self.position)
                        .is_some_and(|c| c.is_ascii_digit() || *c == b'.')
                    {
                        self.position += 1;
                    }
                    if start == self.position {
                        return Err("Falta un valor numérico".into());
                    }
                    std::str::from_utf8(&self.bytes[start..self.position])
                        .map_err(|_| "Número inválido")?
                        .parse::<Decimal>()
                        .map_err(|_| "Número decimal inválido")?
                }
            };
            self.depth -= 1;
            Ok(value)
        }
    }
    if expression.is_empty() || expression.len() > 1000 {
        return Err("La fórmula debe tener entre 1 y 1000 caracteres".into());
    }
    let mut parser = Parser {
        bytes: expression.as_bytes(),
        position: 0,
        vars: variables,
        depth: 0,
    };
    let value = parser.expression()?;
    parser.space();
    if parser.position != parser.bytes.len() {
        return Err("Símbolos no admitidos en fórmula".into());
    }
    Ok(value)
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum CostSource {
    Resource { id: Uuid },
    Analysis { id: Uuid },
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostComponent {
    pub source: CostSource,
    pub quantity_formula: String,
    pub variables: BTreeMap<String, Decimal>,
    pub waste_percent: Decimal,
    pub production_coefficient: Decimal,
    pub yield_factor: Decimal,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NestedAnalysis {
    pub id: Uuid,
    pub code: String,
    pub description: String,
    pub unit: String,
    pub components: Vec<CostComponent>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostLibrary {
    pub analyses: Vec<NestedAnalysis>,
    pub prices: BTreeMap<Uuid, Decimal>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostResult {
    pub unit_cost: Decimal,
    pub resource_quantities: BTreeMap<Uuid, Decimal>,
}
impl CostLibrary {
    pub fn calculate(&self, id: Uuid) -> Result<CostResult, String> {
        let map: BTreeMap<_, _> = self.analyses.iter().map(|a| (a.id, a)).collect();
        if map.len() != self.analyses.len() || map.len() > 10_000 {
            return Err("Biblioteca inválida o demasiado grande".into());
        }
        fn expand(
            id: Uuid,
            factor: Decimal,
            map: &BTreeMap<Uuid, &NestedAnalysis>,
            path: &mut BTreeSet<Uuid>,
            resources: &mut BTreeMap<Uuid, Decimal>,
            remaining: &mut u32,
        ) -> Result<(), String> {
            *remaining = remaining
                .checked_sub(1)
                .ok_or("El ACU supera el límite de complejidad")?;
            if path.len() > 64 || !path.insert(id) {
                return Err("Referencia circular o profundidad excesiva en ACU".into());
            }
            let analysis = map.get(&id).ok_or("ACU anidado inexistente")?;
            if analysis.code.trim().is_empty()
                || analysis.description.trim().is_empty()
                || analysis.unit.trim().is_empty()
                || analysis.components.is_empty()
            {
                return Err("El ACU requiere código, descripción, unidad y componentes".into());
            }
            for component in &analysis.components {
                if component.waste_percent < Decimal::ZERO
                    || component.production_coefficient < Decimal::ZERO
                    || component.yield_factor <= Decimal::ZERO
                {
                    return Err("Coeficientes de producción inválidos".into());
                }
                let base = evaluate_formula(&component.quantity_formula, &component.variables)?;
                if base < Decimal::ZERO {
                    return Err("El consumo no puede ser negativo".into());
                }
                let waste = Decimal::ONE
                    .checked_add(component.waste_percent / Decimal::from(100))
                    .ok_or("Desborde decimal")?;
                let quantity = base
                    .checked_mul(component.production_coefficient)
                    .and_then(|v| v.checked_div(component.yield_factor))
                    .and_then(|v| v.checked_mul(waste))
                    .and_then(|v| v.checked_mul(factor))
                    .ok_or("Desborde decimal")?;
                match component.source {
                    CostSource::Resource { id } => {
                        let entry = resources.entry(id).or_insert(Decimal::ZERO);
                        *entry = entry.checked_add(quantity).ok_or("Desborde decimal")?;
                    }
                    CostSource::Analysis { id } => {
                        expand(id, quantity, map, path, resources, remaining)?
                    }
                }
            }
            path.remove(&id);
            Ok(())
        }
        let mut quantities = BTreeMap::new();
        expand(
            id,
            Decimal::ONE,
            &map,
            &mut BTreeSet::new(),
            &mut quantities,
            &mut 100_000,
        )?;
        let mut total = Decimal::ZERO;
        for (resource, quantity) in &quantities {
            let price = *self
                .prices
                .get(resource)
                .ok_or_else(|| format!("Falta precio explícito para el insumo {resource}"))?;
            if price < Decimal::ZERO {
                return Err("Precio negativo".into());
            }
            total = total
                .checked_add(quantity.checked_mul(price).ok_or("Desborde decimal")?)
                .ok_or("Desborde decimal")?;
        }
        Ok(CostResult {
            unit_cost: total,
            resource_quantities: quantities,
        })
    }
    pub fn sensitivity(
        &self,
        id: Uuid,
        changes: &BTreeMap<Uuid, Decimal>,
    ) -> Result<CostResult, String> {
        let mut modified = self.clone();
        for (resource, percent) in changes {
            if *percent < Decimal::from(-100) {
                return Err("Una variación no puede reducir un precio por debajo de cero".into());
            }
            let price = modified
                .prices
                .get_mut(resource)
                .ok_or("Insumo no cotizado en el escenario")?;
            *price = price
                .checked_mul(
                    Decimal::ONE
                        .checked_add(*percent / Decimal::from(100))
                        .ok_or("Desborde decimal")?,
                )
                .ok_or("Desborde decimal")?;
        }
        modified.calculate(id)
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FxQuote {
    pub from: String,
    pub to: String,
    pub date: String,
    pub source: String,
    pub rate: Decimal,
}
impl FxQuote {
    pub fn convert(&self, amount: Decimal, from: &str, to: &str) -> Result<Decimal, String> {
        chrono::NaiveDate::parse_from_str(&self.date, "%Y-%m-%d")
            .map_err(|_| "Fecha de cotización inválida")?;
        if self.source.trim().is_empty()
            || self.rate <= Decimal::ZERO
            || self.from == self.to
            || from != self.from
            || to != self.to
            || !["ARS", "USD"].contains(&from)
            || !["ARS", "USD"].contains(&to)
        {
            return Err(
                "La conversión requiere moneda, fuente, fecha y cotización explícitas".into(),
            );
        }
        amount
            .checked_mul(self.rate)
            .ok_or("Desborde de conversión".into())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn formulas_are_exact_and_reject_code() {
        let vars = BTreeMap::from([("largo".into(), Decimal::from(3))]);
        assert_eq!(
            evaluate_formula("largo * (0.1 + 0.2) - 0.1", &vars).unwrap(),
            Decimal::new(8, 1)
        );
        for expr in ["1/0", "alert(1)", "desconocido+1", "1;2"] {
            assert!(evaluate_formula(expr, &vars).is_err());
        }
    }
    #[test]
    fn nested_costs_waste_yield_and_sensitivity() {
        let resource = Uuid::new_v4();
        let first = Uuid::new_v4();
        let second = Uuid::new_v4();
        let component = CostComponent {
            source: CostSource::Resource { id: resource },
            quantity_formula: "2".into(),
            variables: BTreeMap::new(),
            waste_percent: Decimal::from(10),
            production_coefficient: Decimal::ONE,
            yield_factor: Decimal::from(2),
        };
        let a = NestedAnalysis {
            id: first,
            code: "A".into(),
            description: "Base".into(),
            unit: "m".into(),
            components: vec![component.clone()],
        };
        let b = NestedAnalysis {
            id: second,
            code: "B".into(),
            description: "Compuesto".into(),
            unit: "m".into(),
            components: vec![CostComponent {
                source: CostSource::Analysis { id: first },
                quantity_formula: "3".into(),
                waste_percent: Decimal::ZERO,
                yield_factor: Decimal::ONE,
                ..component
            }],
        };
        let library = CostLibrary {
            analyses: vec![a, b],
            prices: BTreeMap::from([(resource, Decimal::from(100))]),
        };
        assert_eq!(
            library.calculate(second).unwrap().unit_cost,
            Decimal::from(330)
        );
        assert_eq!(
            library
                .sensitivity(second, &BTreeMap::from([(resource, Decimal::from(10))]))
                .unwrap()
                .unit_cost,
            Decimal::from(363)
        );
    }
    #[test]
    fn rejects_circular_analyses() {
        let id = Uuid::new_v4();
        let a = NestedAnalysis {
            id,
            code: "A".into(),
            description: "A".into(),
            unit: "m".into(),
            components: vec![CostComponent {
                source: CostSource::Analysis { id },
                quantity_formula: "1".into(),
                variables: BTreeMap::new(),
                waste_percent: Decimal::ZERO,
                production_coefficient: Decimal::ONE,
                yield_factor: Decimal::ONE,
            }],
        };
        assert!(CostLibrary {
            analyses: vec![a],
            prices: BTreeMap::new()
        }
        .calculate(id)
        .is_err());
    }
    #[test]
    fn fx_requires_matching_direction_date_and_source() {
        let quote = FxQuote {
            from: "USD".into(),
            to: "ARS".into(),
            date: "2026-11-05".into(),
            source: "Cotización contractual".into(),
            rate: Decimal::from(1000),
        };
        assert_eq!(
            quote.convert(Decimal::from(2), "USD", "ARS").unwrap(),
            Decimal::from(2000)
        );
        assert!(quote.convert(Decimal::ONE, "ARS", "USD").is_err());
    }
}
