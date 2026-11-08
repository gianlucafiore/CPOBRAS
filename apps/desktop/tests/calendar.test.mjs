import test from 'node:test';import assert from 'node:assert/strict';
import {dayNumber,dayISO,isoWeek,calendarDays,isWorkingDate,finishWorking,workingCount} from '../src/services/calendar.js';
import {reverseGeocode} from '../src/services/reverse-geocode.js';
const calendar={start_date:'2026-11-09',nonworking_weekdays:[5,6],holidays:['2026-11-10'],exceptions:{'2026-11-10':{description:'Se trabaja',working:true},'2026-11-13':{description:'Feriado',working:false},'2026-11-14':{description:'Trabajo excepcional',working:true}}};
test('working exceptions override holidays and weekends consistently',()=>{
 assert.equal(isWorkingDate(calendar,'2026-11-10'),true);assert.equal(isWorkingDate(calendar,'2026-11-13'),false);assert.equal(isWorkingDate(calendar,'2026-11-14'),true);
 assert.deepEqual(finishWorking(calendar,'2026-11-09',6),{start:'2026-11-09',finish:'2026-11-16'});assert.equal(workingCount(calendar,'2026-11-09','2026-11-16'),6);
 assert.equal(dayISO(dayNumber('2024-02-29')),'2024-02-29');assert.throws(()=>dayNumber('2026-02-29'));
});
test('year headers and ISO weeks remain distinct over New Year',()=>{
 assert.deepEqual(isoWeek('2027-01-01'),{year:2026,week:53});const [day]=calendarDays(dayNumber('2027-01-01'),1);assert.equal(day.year,'2027');assert.equal(day.weekYear,2026);assert.equal(day.week,53);assert.equal(day.weekday,4);
});
test('reverse geocoding caches a point and maps road, locality and province',async()=>{
 let calls=0;const fetcher=async url=>{calls++;const u=new URL(url);assert.equal(u.hostname,'nominatim.openstreetmap.org');assert.equal(u.searchParams.get('lat'),'-32.946820');return {ok:true,json:async()=>({address:{road:'Pellegrini',house_number:'1200',city:'Rosario',state:'Santa Fe'}})};};
 const p={lat:-32.94682,lon:-60.63932};assert.deepEqual(await reverseGeocode(p,fetcher),{address:'Pellegrini 1200',locality:'Rosario',province:'Santa Fe'});await reverseGeocode(p,fetcher);assert.equal(calls,1);
 await assert.rejects(reverseGeocode({lat:95,lon:0},fetcher),/Coordenadas/);
});
