import {acuUnitsMatch,matchingLibraryAcu} from './ai-acu.js';
import {normalize} from './ai-budget-import.js';

const genericWords=new Set(['para','con','del','por','obra','trabajo','instalacion','colocacion','construccion','ejecucion']);
const terms=value=>new Set(normalize(value).split(' ').filter(word=>word.length>2&&!genericWords.has(word)));
const dimensions=value=>normalize(value).split(' ').filter(word=>/^\d+$/.test(word)).join(' ');
const description=choice=>choice.description||String(choice.title||'').split(' · ').slice(2).join(' · ');

function libraryChoices(seed,choices){
 const label=normalize(seed.description),words=terms(seed.description),size=dimensions(seed.description);
 return choices.flatMap(choice=>{
  if(!choice.key?.startsWith('analysis:')||choice.unit&&!acuUnitsMatch(seed.unit,choice.unit))return [];
  const name=description(choice),normalized=normalize(name);
  if(!normalized)return [];
  if(normalized===label)return [{choice,exact:true,score:Infinity}];
  const candidateSize=dimensions(name);
  if(size&&candidateSize&&size!==candidateSize)return [];
  const candidateWords=terms(name);
  const common=[...words].filter(word=>candidateWords.has(word)).length;
  if(common<2||common*2<Math.min(words.size,candidateWords.size))return [];
  return [{choice,exact:false,score:common/Math.max(words.size,candidateWords.size)}];
 }).sort((a,b)=>b.score-a.score).slice(0,2);
}

export function relevantLibraryAcuNames(brief,choices){
 const words=terms(brief);
 return choices.flatMap(choice=>{
  const name=description(choice);
  if(!choice.key?.startsWith('analysis:')||!name||!choice.unit)return [];
  const matching=[...terms(name)].filter(word=>words.has(word)).length;
  return matching>=2?[{description:name,unit:choice.unit,matching}]:[];
 }).sort((a,b)=>b.matching-a.matching).slice(0,16).map(({description,unit})=>({description,unit}));
}

// Loads at most two library recipes per target. Multiple equal matches can
// inform a proposal, but never choose a recipe automatically.
export function createLibraryAcuSource(choices,invoke,brief=''){
 const standardRequest=/^(?:completa(?:r)?|genera(?:r|me)?|prepara(?:r|me)?) (?:el |los )?acus?(?: pendientes)?(?: (?:de|para) (?:la partida (?:seleccionada|actual)|las partidas(?: existentes)?|este presupuesto))?(?: (?:de|con los de|usando la) (?:la )?biblioteca)?$/;
 const genericFill=standardRequest.test(normalize(brief));

 const loaded=new Map();
 async function read(choice){
  if(!loaded.has(choice.key)){
   loaded.set(choice.key,Promise.resolve().then(()=>invoke('assisted_acu_reference',{key:choice.key})).then(results=>
    results.find(example=>example.key===choice.key&&example.components?.length)
   ).catch(()=>null));
  }
  const example=await loaded.get(choice.key);
  return example&&{...example,source_title:choice.title};
 }
 return async(seeds,resources,isCurrent=()=>true)=>{
  const rows=[],examplesByLine=new Map();
  for(const seed of seeds){
   if(!isCurrent())break;
   const ranked=libraryChoices(seed,choices);
   const matches=(await Promise.all(ranked.map(async candidate=>({...candidate,example:await read(candidate.choice)}))))
    .filter(match=>match.example&&acuUnitsMatch(seed.unit,match.example.unit));
   const exact=ranked.filter(match=>match.exact);
   const selected=exact.length===1&&matches.find(match=>match.choice===exact[0].choice);
   const planned=seed.is_new||Boolean(seed.work_result);
   const additionalSpec=dimensions(seed.work_result)&&dimensions(seed.work_result)!==dimensions(seed.description);
   const row=selected&&(planned?!additionalSpec:genericFill)&&matchingLibraryAcu(seed,selected.example,resources);
   if(row){rows.push(row);continue;}
   if(matches.length)examplesByLine.set(seed.id,matches.map(match=>match.example));
  }
  return {rows,examplesByLine};
 };
}
