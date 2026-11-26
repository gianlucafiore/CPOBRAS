import test from 'node:test';
import assert from 'node:assert/strict';
import {memoryHtml,memoryBlocks,memoryInline} from '../src/services/memory-markdown.js';
import {budgetReportPdf} from '../src/services/budget-print.js';
import {fixture} from './budget-print.test.mjs';

function pages(bytes){
 const objects=new Map([...Buffer.from(bytes).toString('latin1').matchAll(/(?:^|\n)(\d+) 0 obj\n([\s\S]*?)\nendobj/g)].map(m=>[m[1],m[2]]));
 return [...objects.values()].filter(v=>/\/Type \/Page\b/.test(v)).map(page=>{
  const id=/\/Contents (\d+) 0 R/.exec(page)[1];return objects.get(id).split('stream\n')[1].split('\nendstream')[0];
 });
}

test('memory supports basic formatting, preserves existing plain text and escapes all HTML',()=>{
 const value='# Alcance\n\n**Estructura** y *montaje* de m² y m³.\nSegunda línea.\n\n- Materiales\n  - Transporte\n1. Primera etapa\n2. Segunda etapa\n\n<img src=x onerror=alert(1)> & <script>bad()</script>';
 const html=memoryHtml(value);
 assert.match(html,/<h2>Alcance<\/h2>/);assert.match(html,/<strong>Estructura<\/strong>/);assert.match(html,/<em>montaje<\/em>/);
 assert.match(html,/m² y m³\.<br>Segunda línea/);assert.match(html,/--memory-depth:1/);assert.match(html,/memory-list-marker">2\./);
 assert.doesNotMatch(html,/<img|<script|onerror="/);assert.match(html,/&lt;img/);assert.match(html,/&amp;/);
 assert.deepEqual(memoryBlocks('Una línea\nOtra línea'),[{kind:'paragraph',text:'Una línea\nOtra línea'}]);
 assert.equal(memoryInline('\\*literal\\*').map(r=>r.text).join(''),'*literal*');
});

test('client memory is formatted and the quotation follows on the same page when it fits',async()=>{
 const data=fixture();data.document.lines[0].description='TABLE_SENTINEL';
 data.document.presentation={memory:'# SCOPE\n\nMEMORY_SENTINEL **STRONG** and *ITALIC*.\n\n- Included scope'};
 const result=pages(await budgetReportPdf(data));
 assert.equal(result.length,1);
 assert.match(result[0],/MEMORY_SENTINEL[\s\S]*TABLE_SENTINEL[\s\S]*TOTAL ARS/);
 assert.match(result[0],/\/F2 10\.5 Tf[\s\S]*?\(STRONG\) Tj/);assert.match(result[0],/\/F3 10\.5 Tf[\s\S]*?\(ITALIC\) Tj/);
 assert.doesNotMatch(result[0],/\*\*STRONG\*\*|# SCOPE/);
});

test('long memory retains its final paragraph before the quotation',async()=>{
 const data=fixture();data.document.lines[0].description='TABLE_SENTINEL';
 const memory=Array.from({length:150},(_,i)=>`**Etapa ${i+1}**: ${'Alcance y condiciones de la obra. '.repeat(4)}`).join('\n\n')+'\n\nEND_OF_MEMORY';
 const result=pages(await budgetReportPdf(data,{layout:'memory_sheet_price',memory}));
 const quotation=result.findIndex(p=>p.includes('TABLE_SENTINEL')),lastMemory=result.findIndex(p=>p.includes('END_OF_MEMORY'));
 assert.ok(quotation>2);
 assert.ok(lastMemory === quotation || lastMemory === quotation-1);
 if (lastMemory === quotation) assert.match(result[quotation],/END_OF_MEMORY[\s\S]*TABLE_SENTINEL/);
});

test('explicit sheet-only and memory-with-price layouts keep their requested contents',async()=>{
 const data=fixture();data.document.lines[0].description='TABLE_SENTINEL';
 const sheet=pages(await budgetReportPdf(data,{layout:'sheet_price',memory:'MEMORY_SENTINEL'}));
 assert.equal(sheet.length,1);assert.match(sheet[0],/TABLE_SENTINEL/);assert.doesNotMatch(sheet[0],/MEMORY_SENTINEL/);
 const memory=pages(await budgetReportPdf(data,{layout:'memory_price',memory:'MEMORY_SENTINEL'}));
 assert.equal(memory.length,1);assert.match(memory[0],/MEMORY_SENTINEL/);assert.match(memory[0],/TOTAL ARS/);assert.doesNotMatch(memory[0],/TABLE_SENTINEL/);
});
