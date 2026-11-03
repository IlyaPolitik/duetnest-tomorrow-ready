import test from'node:test';import assert from'node:assert/strict';import{translate,locale}from'../src/i18n.ts';
test('Ukrainian interface leaves original evidence, dates and English variant intact',()=>{
 assert.equal(locale('?lang=uk'),'uk');assert.equal(locale('?lang=UK'),'en');
 assert.equal(translate('Add source','uk'),'Додати джерело');assert.equal(translate('Add source','en'),'Add source');
 const quote='Zbiórka o 08:20.';assert.equal(translate('Date suggested by Meta: {0}. Quote: {1}','uk','2026-12-16',quote),'Дата за відповіддю Meta: 2026-12-16. Цитата: '+quote);
 assert.equal(translate(quote,'uk'),quote);
 assert.equal(translate('Arrival is 5–10 minutes after the meeting.','uk'),'Прибуття на 5–10 хв пізніше зустрічі.');
 assert.equal(translate('Plan for departure at 08:35','uk'),'Запланувати відправлення о 08:35');
});
test('stored English update explanations render Ukrainian without changing times or source text',()=>{
 const warning='Document explicitly replaces previous meeting time 08:20 with new time 08:05; only the current time 08:05 is extracted as active.';
 assert.equal(translate(warning,'uk'),'У листі попередній час зустрічі 08:20 замінено на 08:05. Чинний час — 08:05.');
 assert.equal(translate(warning,'en'),warning);
 const omitted="Packing requirements are referenced as 'still apply' but not listed in this update and therefore not extracted.";
 assert.match(translate(omitted,'uk'),/залишаються чинними/);
 const unknown='Unknown conflict warning';assert.equal(translate(unknown,'uk'),unknown);
});
