// Procedencia comprobable de metrados y coherencia de consumos.
// Las reglas son dimensionales y numéricas, no dependen de nombres comerciales.
import {compareDecimals,multiplyDecimals} from '../decimal.js';
import {importDecimal,normalize} from './ai-budget-import.js';

const U={
 m:['length','1'],metro:['length','1'],metros:['length','1'],cm:['length','0.01'],mm:['length','0.001'],
 m2:['area','1'],m²:['area','1'],cm2:['area','0.0001'],cm²:['area','0.0001'],
 m3:['volume','1'],m³:['volume','1'],l:['volume','0.001'],litro:['volume','0.001'],litros:['volume','0.001'],
 kg:['mass','1'],kilogramo:['mass','1'],g:['mass','0.001'],tn:['mass','1000'],t:['mass','1000'],
 un:['count','1'],unidad:['count','1'],unidades:['count','1'],
 h:['time','1'],hora:['time','1'],horas:['time','1'],mes:['time','720'],meses:['time','720']
};
export function unitDimension(unit){
 const cleaned=String(unit||'').trim().toLowerCase().replace(/\s+/g,'');
 const value=U[cleaned]||U[normalize(cleaned)];
 return value?{dimension:value[0],scale:value[1]}:null;
}
const decimal=value=>{
 try{
  if(typeof value!=='string'&&typeof value!=='number')return null;
  return importDecimal(String(value).trim(),'decimal',true);
 }catch{return null;}
};
const canonical=value=>normalize(value).replace(/\s+/g,' ');
const numericInText=(quantity,quote)=>{
 const value=decimal(quantity);
 if(!value)return false;
 const numericMatches=String(quote).match(/\d+(?:[.,]\d+)?/g)||[];
 return numericMatches.some(token=>{
  const tested=decimal(token.replace(',','.'));
  return tested&&compareDecimals(tested,value)===0;
 });
};
const quoteMatches=(quote,brief)=>Boolean(quote&&canonical(brief).includes(canonical(quote)));
const quotedUnit=(quote,unit)=>{
 const target=unitDimension(unit);
 if(!target)return false;
 const normalized=String(quote).toLowerCase().replace(/²/g,'2').replace(/³/g,'3');
 const tokens=normalized.match(/(?:m2|m3|kg|tn|cm2|cm|mm|m|g|l|unidades?|metros?|kilogramos?|litros?)\b/g)||[];
 return tokens.some(token=>{
  const matched=unitDimension(token);
  return matched?.dimension===target.dimension;
 });
};
const descriptorOverlap=(text,quote)=>{
 const words=new Set(canonical(quote).split(' ').filter(token=>token.length>=5&&!/^\d+$/.test(token)));
 return canonical(text).split(' ').some(token=>token.length>=5&&words.has(token));
};
const factorPower={length:1,area:2,volume:3,count:0};
export function validateWorkQuantity({quantity,unit,source,brief='',description='' }){
 const value=decimal(quantity);
 if(value==null||compareDecimals(value,'0')<=0)return {quantity:null,status:'pending',issue:quantity!=null?'Cantidad no positiva o inválida; queda por medir':''};
 if(!source||typeof source!=='object'||Array.isArray(source))
  return {quantity:null,status:'pending',issue:'Cantidad sugerida sin procedencia verificable; queda por medir'};
 const target=unitDimension(unit);
 if(!target)return {quantity:null,status:'pending',issue:'Unidad del metrado sin conversión dimensional verificable'};
 if(source.kind==='explicit'){
  const quote=typeof source.quote==='string'?source.quote.trim():'';
  if(!quoteMatches(quote,brief)||!numericInText(value,quote)||!quotedUnit(quote,unit)||!descriptorOverlap(description,quote))
   return {quantity:null,status:'pending',issue:'La cantidad no está vinculada explícitamente a esta partida en el pedido original'};
  return {quantity:value,status:'provided',issue:''};
 }
 if(source.kind==='calculated'){
  if(!Array.isArray(source.factors)||source.factors.length<2||source.factors.length>6)
   return {quantity:null,status:'pending',issue:'Faltan los factores verificables del metrado'};
  let product='1',power=0;
  for(const factor of source.factors){
   const valueFactor=decimal(factor?.value),dimension=unitDimension(factor?.unit);
   if(!valueFactor||compareDecimals(valueFactor,'0')<=0||!dimension||
      !Object.hasOwn(factorPower,dimension.dimension)||
      !quoteMatches(factor.quote,brief)||!numericInText(valueFactor,factor.quote)||
      !quotedUnit(factor.quote,factor.unit))
    return {quantity:null,status:'pending',issue:'Los factores del cálculo no están documentados en el pedido'};
   power+=factorPower[dimension.dimension];
   product=multiplyDecimals(product,multiplyDecimals(valueFactor,dimension.scale));
  }
  const wanted=factorPower[target.dimension];
  if(power!==wanted||compareDecimals(product,multiplyDecimals(value,target.scale))!==0)
   return {quantity:null,status:'pending',issue:'La fórmula o las unidades no justifican el metrado propuesto'};
  return {quantity:value,status:'calculated',issue:''};
 }
 return {quantity:null,status:'pending',issue:'Procedencia del metrado no reconocida; queda por medir'};
}
// No confundir el total de una obra con consumo POR UNA UNIDAD de partida.
export function consumptionScaleErrors({partQuantity,partUnit,componentQuantity,componentUnit,quantityScope}){
 const errors=[],value=decimal(componentQuantity),total=decimal(partQuantity);
 if(!value||compareDecimals(value,'0')<=0)return errors;
 if(quantityScope==='total')errors.push('Se informó cantidad total del insumo, no consumo por unidad de partida. Calculá el rendimiento unitario antes de guardar.');
 const part=unitDimension(partUnit),component=unitDimension(componentUnit);
 if(part&&component){
  const scaled=multiplyDecimals(value,component.scale);
  if(part.dimension===component.dimension){
   const ratio=multiplyDecimals(scaled,part.scale==='1'?'1':String(1/Number(part.scale)));
   if(compareDecimals(ratio,'10')>0)
    errors.push('Consumo desproporcionado en la misma dimensión que la partida; verificá que no se haya copiado el metrado total.');
  }else if(part.dimension==='area'&&component.dimension==='length'&&compareDecimals(scaled,'10')>0){
   errors.push('Más de 10 metros lineales por m² de partida: falta justificar la geometría, la separación o el ancho útil.');
  }
 }
 if(total&&compareDecimals(total,'10')>=0&&compareDecimals(value,'10')>0&&compareDecimals(value,total)===0)
  errors.push('El consumo unitario coincide numéricamente con el metrado total de la partida; revisá la escala del cálculo.');
 return errors;
}
