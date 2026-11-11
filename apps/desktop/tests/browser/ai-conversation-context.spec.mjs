import {test,expect} from '@playwright/test';
test('browser retains a single pending destination and isolates persisted budgets',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {conversationAcuRequest,conversationStore}=await import('/src/services/ai-conversation-context.js');
  const state={selectedLineId:'one',lines:Array.from({length:81},(_,i)=>({id:i?'line-'+i:'one'}))};
  let intent=conversationAcuRequest('generar ACU de la partida seleccionada',state,null);
  intent=conversationAcuRequest('usá monocapa, hidrófugo y mano de obra',state,intent);
  conversationStore(sessionStorage,'test-project','test-estimate').write([],intent);
  return {intent,other:conversationStore(sessionStorage,'test-project','other').read()};
 });
 expect(result.intent.lineIds).toEqual(['one']);
 expect(result.other).toBeNull();
 await page.reload();
 const restored=await page.evaluate(async()=>{
  const {conversationStore,conversationAcuRequest}=await import('/src/services/ai-conversation-context.js');
  const {intent}=conversationStore(sessionStorage,'test-project','test-estimate').read();
  return conversationAcuRequest('bueno cargalos',{selectedLineId:'two',lines:[{id:'one'},{id:'two'}]},intent);
 });
 expect(restored.lineIds).toEqual(['one']);
 expect(restored.brief).toContain('monocapa');
 expect(restored.approval).toBeUndefined();
});
