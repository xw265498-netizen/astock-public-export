from pathlib import Path
p=Path('site/index.html'); s=p.read_text(encoding='utf-8-sig')

old="function splitKeyAnswer(text){\n  const marker='【关键回答】';"
new=r'''function dedupeAnswer(text){
  let t=String(text||'').replace(/\r/g,'').trim();
  if(!t) return t;
  const M='【关键回答】';
  const pos=[]; let i=0;
  while((i=t.indexOf(M,i))>=0){ pos.push(i); i+=M.length; }
  if(pos.length>1){
    const firstMain=t.slice(0,pos[0]).trim();
    const probe=(firstMain.split('\n').map(x=>x.trim()).find(x=>x.length>=10)||firstMain.slice(0,40)).trim();
    if(probe){
      const at=t.indexOf(probe,pos[0]+M.length);
      if(at>0){ t=(t.slice(0,at).trim()+'\n'+M+'\n'+t.slice(pos[0]+M.length,at).trim()).trim(); }
      else { t=t.slice(0,pos[1]).trim(); }
    } else { t=t.slice(0,pos[1]).trim(); }
  }
  const blocks=t.split(/\n{2,}/).map(x=>x.trim()).filter(Boolean);
  const seen=new Set(), out=[];
  for(const b of blocks){
    const k=b.replace(/\s+/g,'');
    if(k.length>25 && seen.has(k)) continue;
    if(k.length>25) seen.add(k);
    out.push(b);
  }
  t=out.join('\n\n');
  if(t.includes(M)){
    const a=t.slice(0,t.indexOf(M)+M.length);
    const key=t.slice(t.indexOf(M)+M.length);
    const lines=key.split('\n'); const ks=new Set(), ko=[];
    for(const l of lines){ const k=l.trim(); if(k && ks.has(k)) continue; if(k) ks.add(k); ko.push(l); }
    t=a+ko.join('\n');
  }
  return t.trim();
}
function splitKeyAnswer(text){
  text=dedupeAnswer(text);
  const marker='【关键回答】';'''
assert old in s
s=s.replace(old,new,1)

old="  let tailKey='';\n  if(kind==='assistant'){\n    const parts=splitKeyAnswer(text);"
new="  let tailKey='';\n  if(kind==='assistant'){\n    text=dedupeAnswer(text);\n    const parts=splitKeyAnswer(text);"
assert old in s
s=s.replace(old,new,1)

old="    (hist||[]).slice(-20).forEach(m=>{ if(m.role==='user'||m.role==='assistant') ctx.push({role:m.role,content:m.content}); });"
new="    const recentHist=(hist||[]).slice(-12);\n    recentHist.forEach(m=>{ if(m.role==='user'||m.role==='assistant'){ const c=String(m.content||'').replace(/【关键回答】[\\s\\S]*/,'').trim().slice(0,1200); if(c) ctx.push({role:m.role,content:c}); } });\n    ctx.push({role:'system',content:'历史消息只用于理解上下文，禁止复述、续写或重复上一轮回答；每次只回答用户这一次的问题。'});"
assert old in s
s=s.replace(old,new,1)

old="    const stored=mainAns+(keyAns?('\\n'+KEY_MARK+'\\n'+keyAns):'');"
new="    const stored=dedupeAnswer(mainAns+(keyAns?('\\n'+KEY_MARK+'\\n'+keyAns):''));"
assert old in s
s=s.replace(old,new,1)

old="""  const up=(q.chgPct||0)>0, down=(q.chgPct||0)<0;
  const mt=q.marketTime||'';
  const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
  const tm=mt? (mt.slice(0,10)===today?mt.slice(11,19):mt.slice(5,16)) : '时间未知';
  let state='实时', dot='';
  if(q.stale){
    const same=mt.slice(0,10)===today;
    const hm=same?Number(mt.slice(11,13))*60+Number(mt.slice(14,16)):0;
    if(same && hm>=900){ state='已收盘'; dot='closed'; }
    else if(same && hm<570){ state='盘前'; dot='closed'; }
    else { state='延迟'; dot='stale'; }
  }"""
new="""  const up=(q.chgPct||0)>0, down=(q.chgPct||0)<0;
  const mt=q.marketTime||'';
  const nowCN=new Date(Date.now()+8*3600000);
  const today=nowCN.toISOString().slice(0,10);
  const nowMin=nowCN.getUTCHours()*60+nowCN.getUTCMinutes();
  const qDate=mt.slice(0,10);
  const tm=mt? (qDate===today?mt.slice(11,19):mt.slice(5,16)) : '时间未知';
  let state='实时', dot='';
  if(mt && qDate && qDate!==today){
    state='上一交易日收盘'; dot='closed';
  } else if(mt){
    const hm=Number(mt.slice(11,13))*60+Number(mt.slice(14,16));
    const age=Math.max(0,(nowMin-hm)*60);
    if(nowMin<570){ state='盘前'; dot='closed'; }
    else if(nowMin<=690){ state=(q.stale||age>180)?'延迟':'交易中'; dot=(q.stale||age>180)?'stale':''; }
    else if(nowMin<780){ state='午间休市'; dot='closed'; }
    else if(nowMin<900){ state=(q.stale||age>180)?'延迟':'交易中'; dot=(q.stale||age>180)?'stale':''; }
    else { state='已收盘'; dot='closed'; }
  } else if(q.stale){ state='延迟'; dot='stale'; }"""
assert old in s
s=s.replace(old,new,1)

old="        if(q.stale) quoteCtx+='【该行情已超过5分钟未变动，A股大概率已休市，必须按这个收盘/最近时点讲，禁止说“现在”】';"
new="        const cnNow=new Date(Date.now()+8*3600000);\n        const cnToday=cnNow.toISOString().slice(0,10);\n        const qDay=(q.marketTime||'').slice(0,10);\n        if(qDay && qDay!==cnToday){ quoteCtx+='【这是上一交易日（'+qDay+'）的收盘数据，不是今天实时价；必须明确说“上一交易日收盘/最近收盘”，禁止说“现在、实时、今天”】'; }\n        else if(q.stale) quoteCtx+='【该行情已超过5分钟未变动，A股大概率已休市，必须按这个收盘/最近时点讲，禁止说“现在”】';"
assert old in s
s=s.replace(old,new,1)

old="  '10. 他说方言或口音重，按意思理解，别纠正他的说法。'"
new="  '10. 他说方言或口音重，按意思理解，别纠正他的说法。',\n  '11. 不要复述或续写上一轮回答，每次只回答用户这一次问的内容；历史只是背景。',\n  '12. 行情时间如果不是今天，必须说“上一交易日收盘”，绝不能说成“现在/实时”。'"
assert old in s
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('patched',len(s))
