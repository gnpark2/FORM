import test from 'node:test';
import assert from 'node:assert/strict';
import {removeConnectedBackground,cropBounds} from '../public/photo-editor.js';
function pixels(w,h,rgb=[255,255,255]){return new Uint8ClampedArray(Array.from({length:w*h},()=>[...rgb,255]).flat());}
test('connected background removal retains garment outline and disconnected matching colors',()=>{
 const data=pixels(7,7);for(let y=1;y<=5;y++)for(let x=1;x<=5;x++){if(x===1||x===5||y===1||y===5)data.set([20,40,30,255],(y*7+x)*4);}
 assert.equal(removeConnectedBackground(data,7,7,[[0,0]],20),24);
 assert.equal(data[(3*7+3)*4+3],255);assert.equal(data[(1*7+1)*4+3],255);assert.equal(data[3],0);
});
test('tolerance handles near-white backgrounds while preserving existing transparent pixels',()=>{
 const data=pixels(3,1);data.set([240,240,240,255],4);data.set([180,180,180,0],8);
 assert.equal(removeConnectedBackground(data,3,1,[[0,0]],20),2);assert.equal(data[11],0);
 const tight=pixels(2,1);tight.set([230,230,230,255],4);assert.equal(removeConnectedBackground(tight,2,1,[[0,0]],5),1);assert.equal(tight[7],255);
});
test('four-corner operation handles separate background regions and invalid seeds safely',()=>{
 const data=pixels(3,3);for(let y=0;y<3;y++)data.set([0,0,0,255],(y*3+1)*4);
 assert.equal(removeConnectedBackground(data,3,3,[[-1,0],[0,0],[2,0],[0,2],[2,2]],20),6);assert.equal(data[(1*3+1)*4+3],255);
});
test('crop bounds clamp selection inside image and avoid empty rectangles',()=>{
 assert.deepEqual(cropBounds(100,80,{x:-10,y:70,width:200,height:30}),{x:0,y:70,width:100,height:10});
 assert.deepEqual(cropBounds(100,80,{x:200,y:90,width:0,height:-5}),{x:99,y:79,width:1,height:1});
});
