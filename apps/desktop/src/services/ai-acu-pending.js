// After an approved batch creates work lines without all ACUs, preserve their
// exact IDs and verified resource selections. Continue in FILL mode only:
// incomplete ACUs may be reviewed, but no work line is created twice.
export function rebasePendingAcuRows({rows=[],seeds=[],targetIds=[],composedIds=[],context={}}){
 const composed=new Set(composedIds),lines=new Map((context.lines||[]).map(line=>[line.id,line]));
 const previous=new Map(rows.map(row=>[row.id,row])),original=new Map(seeds.map(seed=>[seed.id,seed]));
 const result=[],pending=[],missing=[];
 for(const id of targetIds){
  if(composed.has(id))continue;
  const actual=lines.get(id);
  if(!actual){missing.push(id);continue;}
  const old=previous.get(id),base=old?.seed||original.get(id)||{};
  const seed={...actual,is_new:false,
   work_result:base.work_result||'',
   expected_resources:structuredClone(base.expected_resources||[]),
   outline_issues:[...(base.outline_issues||[])],
   section:base.section||actual.section||''};
  const draft=old
   ?{...old,seed,selected:false,section_id:actual.section_id||null,
     section_title:actual.section_id?'':old.section_title||base.section||''}
   :{id,seed,selected:false,components:[],measurements:[],apply_measurements:false,
     section_id:actual.section_id||null,section_title:actual.section_id?'':base.section||'',
     assumptions:[],missing_resources:[],missing_resource_drafts:[],missing_resolved:false};
  result.push(draft);pending.push(id);
 }
 return {rows:result,targetIds:pending,missingLineIds:missing,count:pending.length+missing.length};
}
