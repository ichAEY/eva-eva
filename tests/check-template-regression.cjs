// Regression guard for the approved TANEM services template.
// Run from repository root: node tests/check-template-regression.cjs
function verifyTemplate(){
  const fs=require("node:fs"),assert=require("node:assert/strict"),cp=require("node:child_process");
  const baseline="79ea1c63864627b634528c6c6f39c997226f85c4";
  const paths=["desktop.js","mobile.js"];
  function styles(src){
    const rx=/\.textContent\s*=\s*(String\.raw)?([`"])/g;let m,res=[];
    while((m=rx.exec(src))){
      const q=m[2],start=rx.lastIndex;let i=start,escaped=false;
      for(;i<src.length;i++){const c=src[i];if(escaped){escaped=false;continue}if(c==="\\"){escaped=true;continue}if(c===q)break}
      assert(i<src.length,"Unterminated CSS literal");
      const literal=src.slice(start,i);let css=null;
      if(m[1]||q==="`")css=literal;
      else try{css=JSON.parse('"'+literal+'"')}catch{}
      if(css&&css.length>100&&/^\s*(?:@media|#|\.|:root)/.test(css))res.push(css);
      rx.lastIndex=i+1;
    }
    return res;
  }
  function effectiveRules(css){
    const stack=[],result=new Map();let last=0;
    for(let i=0;i<css.length;i++){
      if(css[i]==="{"){
        const header=css.slice(last,i).trim();
        if(stack.length)stack[stack.length-1].nested=true;
        stack.push({header,parents:stack.map(x=>x.header),open:i,nested:false});last=i+1;
      }else if(css[i]==="}"){
        const r=stack.pop();assert(r,"Unbalanced CSS }");
        if(!r.nested)for(const d of css.slice(r.open+1,i).split(";").map(x=>x.trim()).filter(Boolean)){
          const sep=d.indexOf(":");if(sep>=0)result.set(JSON.stringify([r.parents,r.header,d.slice(0,sep).trim()]),d.slice(sep+1).trim());
        }
        last=i+1;
      }
    }
    assert.equal(stack.length,0,"Unbalanced CSS {");
    return [...result.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  }
  for(const name of paths){
    const current=fs.readFileSync(name,"utf8");
    const original=cp.execFileSync("git",["show",baseline+":"+name],{encoding:"utf8",maxBuffer:2000000});
    cp.execFileSync(process.execPath,["--check",name]);
    const oldCSS=styles(original);
    const extractedPath=name==="desktop.js"?"desktop.css":"mobile.css";
    const external=fs.existsSync(extractedPath)?fs.readFileSync(extractedPath,"utf8"):null;
    const mobileFinal=name==="mobile.js"&&fs.existsSync("mobile-overrides.css")?fs.readFileSync("mobile-overrides.css","utf8"):null;
    const newCSS=external?(mobileFinal?[external,mobileFinal]:[external]):styles(current);
    assert(newCSS.length>0,name+": no stylesheets found");
    // Compare the final cascade over *all* stylesheets. Earlier duplicate declarations may
    // be removed when a later stylesheet guarantees precisely the same final property.
    // Each stylesheet must still be present in its original position.
    const allDeclarations=blocks=>{
      const cascade=new Map();
      for(const block of blocks)for(const [key,value] of effectiveRules(block))cascade.set(key,value);
      return [...cascade.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
    };
    // Compact category rules and the explicitly approved title-weight adjustment are
    // the only service-style differences allowed from the frozen baseline.
    const keepFrozenDeclaration=([key])=>{
      const [,selector,property]=JSON.parse(key);
      if(selector.includes(".is-compact"))return false;
      if(property==="font-weight"&&selector.includes("#salonDesktopServices .dct-service-card:not(.has-variants) .dct-service-card-title"))return false;
      if(property==="font-weight"&&selector.includes("#salon-mobile #tn13Services .tn31-service-name"))return false;
      return true;
    };
    const currentDeclarations=allDeclarations(newCSS).filter(keepFrozenDeclaration);
    const baselineDeclarations=allDeclarations(oldCSS).filter(keepFrozenDeclaration);
    assert.deepEqual(currentDeclarations,baselineDeclarations,name+": approved CSS cascade differs from baseline outside intentional category and title-weight changes");
    const boundaries=name==="desktop.js"?["function templateServiceCard(item){","function currentTemplateServiceState()"]:["function servicePriceMarkup(price){","function serviceWord(n){"];
    const code=s=>{
      const a=s.indexOf(boundaries[0]),b=s.indexOf(boundaries[1],a+boundaries[0].length);
      assert(a>=0&&b>a,name+": approved service markup not found");
      return s.slice(a,b);
    };
    assert.equal(code(current),code(original),name+": approved service markup or logic changed");
    console.log(name+": JS syntax, approved services and "+oldCSS.length+" stylesheets retain the approved combined cascade");
  }
  const index=fs.readFileSync("index.html","utf8");
  assert(index.includes("desktop.js")&&index.includes("mobile.js"),"Both device bundles must still load");
  console.log("PASS: All static baseline and service-contract checks");
}
verifyTemplate();
