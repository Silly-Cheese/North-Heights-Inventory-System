import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../src/report-pdf.js',import.meta.url));
const {buildInventoryPdf}=await import('data:text/javascript;base64,'+source.toString('base64'));

function fakePdf(landscape=false){
  const width=landscape?297:210, height=landscape?210:297;
  const ops=[];
  let page=1, totalPages=1, fontSize=8;
  const doc={
    internal:{pageSize:{getWidth:()=>width,getHeight:()=>height}},
    setTextColor(){},setFillColor(){},setDrawColor(){},setLineWidth(){},setFont(){},
    setFontSize(value){fontSize=value;},
    text(value,x,y){
      assert.ok(x>=0 && x<=width,'text horizontal overflow');
      assert.ok(y>=0 && y<=height,'text vertical overflow');
      ops.push({page,kind:'text',value:String(value),x,y});
    },
    rect(x,y,w,h){
      assert.ok(y>=0 && y+h<=height+0.1,'rectangle vertical overflow');
    },
    roundedRect(x,y,w,h){
      assert.ok(y>=0 && y+h<=height+0.1,'rounded rectangle vertical overflow');
    },
    line(x1,y1,x2,y2){
      assert.ok(y1>=0 && y2<=height+0.1,'line overflow');
    },
    splitTextToSize(input,available){
      const max=Math.max(1,Math.floor(available/(fontSize*.32)));
      const pieces=String(input).split(/ +/);
      const output=[];
      let line='';
      for(const word of pieces){
        if((line+' '+word).length<=max){
          line+=(line?' ':'')+word;
        }else{
          if(line)output.push(line);
          if(word.length>max){
            for(let i=0;i<word.length;i+=max)output.push(word.slice(i,i+max));
            line='';
          }else line=word;
        }
      }
      if(line)output.push(line);
      return output.length?output:[''];
    },
    addPage(){page++;totalPages=Math.max(totalPages,page);},
    setPage(n){page=n;},
    getNumberOfPages(){return totalPages;}
  };
  return {doc,ops};
}
const detail=['Room','Item','Category','Quantity','Condition','Notes','Status'];
const decisions=['Room','Item','Total qty','Decision status','Retain','With property','Donate','Sell','Dispose','Unallocated','Notes','Reviewed by'];
const cases=[
  {
    type:'full',landscape:true,columns:detail,
    records:Array.from({length:88},(_,i)=>[
      'Room '+Math.floor(i/8),'Folding chairs '+i,'Furniture',i+1,'Good',
      i%13===0?'Long notes: '+('Wooden, padded, stackable seating. '.repeat(100)):'Regular inventory item','in-progress'
    ])
  },
  {
    type:'room',landscape:false,columns:detail,
    records:Array.from({length:30},(_,i)=>['Auditorium','Microphone '+i,'Audio & Video',1,'Good','With accessories','verified']),
    filter:'room-1'
  },
  {
    type:'condition',landscape:false,columns:['Condition','Item types','Total units'],
    records:[['Good',14,283],['Fair',2,9],['Broken',1,1]]
  },
  {
    type:'disposition',landscape:true,columns:decisions,
    records:Array.from({length:50},(_,i)=>['Auditorium','Wooden chair '+i,24,'proposed',5,9,5,5,0,0,
      'Notes '+('Verify with congregation leadership. '.repeat(i%8===0?90:1)),''])
  }
];
for(const c of cases){
  test('professional '+c.type+' PDF keeps text in page bounds and paginates',()=>{
    const {doc,ops}=fakePdf(c.landscape);
    const report={
      reportType:c.type,roomFilter:c.filter||'all',
      title:c.type+' record',source:'Current working inventory',createdAt:'11/03/2026',
      roomCount:8,itemTypes:c.records.length,units:250,
      rows:[c.columns,...c.records]
    };
    const before=JSON.stringify(report);
    const output=buildInventoryPdf(doc,report,{workspace:'test'});
    assert.equal(output,doc);
    assert.equal(JSON.stringify(report),before,'report source data should remain unchanged');
    assert.ok(ops.some(op=>op.value.includes('NORTH HEIGHTS CHURCH OF CHRIST')));
    assert.equal(ops.filter(op=>op.value.startsWith('PAGE ')).length,doc.getNumberOfPages());
    assert.ok(doc.getNumberOfPages()>=1);
  });
}
test('empty report still prints correct letterhead and explanation',()=>{
  const {doc,ops}=fakePdf();
  buildInventoryPdf(doc,{reportType:'condition',title:'Condition summary',rows:[['Condition','Item types','Total units']]},{workspace:'official'});
  assert.ok(ops.some(op=>op.value.includes('No records match')));
  assert.ok(ops.some(op=>op.value.includes('OFFICIAL')));
});
