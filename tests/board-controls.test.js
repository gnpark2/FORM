import test from 'node:test';
import assert from 'node:assert/strict';
import {resizedWidth,rotatedAngle,normalizeRotation} from '../public/board-controls.js';
test('corner resize respects rotation, aspect ratio and direction',()=>{
 assert.equal(resizedWidth(40,0,2,1000,50,100,[1,1]),50);
 assert.equal(resizedWidth(40,90,2,1000,-100,50,[1,1]),50);
 assert.equal(resizedWidth(40,0,2,1000,-50,-100,[-1,-1]),50);
 assert.equal(resizedWidth(40,0,2,1000,-50,-100,[1,1]),30);
});
test('resizing clamps to persisted board limits',()=>{
 assert.equal(resizedWidth(40,0,1,1000,900,900,[1,1]),85);
 assert.equal(resizedWidth(40,0,1,1000,-900,-900,[1,1]),12);
});
test('rotation crosses angle boundary without jumping and supports snapping',()=>{
 assert.equal(rotatedAngle(10,179*Math.PI/180,-179*Math.PI/180),12);
 assert.equal(rotatedAngle(0,0,22*Math.PI/180,true),15);
 assert.equal(normalizeRotation(190),-170);assert.equal(normalizeRotation(-190),170);
});
