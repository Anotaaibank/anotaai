import test from 'node:test';
import assert from 'node:assert/strict';
import {storyFrame, storyProgress, shouldSimplifyStory} from '../lib/landing-motion.ts';

test('a cena acompanha o deslocamento nos dois sentidos e limita saltos para fora da seção', () => {
 assert.equal(storyProgress(50, 100, 400), 0);
 assert.equal(storyProgress(300, 100, 400), .5);
 assert.equal(storyProgress(600, 100, 400), 1);
 assert.equal(storyProgress(200, 100, 400), .25);
 for (const invalid of [0, -1, NaN, Infinity]) assert.equal(storyProgress(300, 100, invalid), 0);
 assert.equal(storyProgress(NaN, 100, 400), 0);
});
test('ilustração só organiza após a confirmação e retorna ao início ao rolar de volta', () => {
 for (let p=0; p<=.38; p+=.01) {
  assert.equal(storyFrame(p).card, 0);
  assert.equal(storyFrame(p).dashboard, 0);
 }
 assert.equal(storyFrame(.54).confirmed, 1);
 assert.equal(storyFrame(.67).card, 1);
 assert.equal(storyFrame(1).dashboard, 1);
 assert.equal(storyFrame(1).dock, 1);
 assert.equal(storyFrame(.1).confirmed, 0);
 assert.equal(storyFrame(.1).dashboard, 0);
 for (const p of [NaN, Infinity, -1, 0, .15, .38, .54, .67, .86, 1, 2]) {
  const frame = storyFrame(p);
  for (const key of ['message','summary','confirmed','card','dashboard','dock'] as const) assert.ok(Number.isFinite(frame[key]) && frame[key]>=0 && frame[key]<=1);
 }
});
test('movimento reduzido, economia de dados e telas curtas usam etapas sem fixação', () => {
 const supported = {reducedMotion:false,saveData:false,sticky:true,height:844,cores:4};
 assert.equal(shouldSimplifyStory(supported), false);
 for (const change of [{reducedMotion:true},{saveData:true},{sticky:false},{height:600},{cores:2}]) assert.equal(shouldSimplifyStory({...supported,...change}), true);
 assert.equal(shouldSimplifyStory({...supported,cores:undefined}), false);
});
