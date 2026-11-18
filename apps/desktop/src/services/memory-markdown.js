import {e} from "../components/helpers.js";

// A deliberately small Markdown dialect: no raw HTML, images or executable links.
export function memoryInline(value) {
  const text=String(value),runs=[];
  let plain="";
  const flush=()=>{if(plain){runs.push({text:plain,bold:false,italic:false});plain="";}};
  for(let i=0;i<text.length;){
    if(text[i]==="\\"&&/[\\*#_]/.test(text[i+1]||"")){plain+=text[i+1];i+=2;continue;}
    const marker=text.startsWith("***",i)?"***":text.startsWith("**",i)?"**":text[i]==="*"?"*":null;
    const end=marker?text.indexOf(marker,i+marker.length):-1;
    if(marker&&end>i+marker.length){
      flush();
      for(const run of memoryInline(text.slice(i+marker.length,end)))
        runs.push({...run,bold:run.bold||marker.length>1,italic:run.italic||marker.length!==2});
      i=end+marker.length;
    }else{plain+=text[i++];}
  }
  flush();return runs;
}

export function memoryBlocks(value) {
  const blocks=[],lines=String(value||"").replace(/\r\n?/g,"\n").split("\n");
  let paragraph=[];
  const flush=()=>{if(paragraph.length){blocks.push({kind:"paragraph",text:paragraph.join("\n")});paragraph=[];}};
  for(const line of lines){
    const heading=/^\s{0,3}(#{1,3})\s+(.+)$/.exec(line);
    const item=/^(\s*)(?:([-+*])\s+|(\d{1,6})[.)]\s+)(.+)$/.exec(line);
    if(!line.trim()){flush();continue;}
    if(heading){flush();blocks.push({kind:"heading",level:heading[1].length,text:heading[2]});}
    else if(item){flush();blocks.push({kind:"item",depth:Math.min(4,Math.floor(item[1].replace(/\t/g,"  ").length/2)),number:item[3]||null,text:item[4]});}
    else paragraph.push(line);
  }
  flush();return blocks;
}

export function memoryHtml(value) {
  const inline=text=>memoryInline(text).map(run=>{
    let html=e(run.text).replace(/\n/g,"<br>");
    if(run.italic)html=`<em>${html}</em>`;
    if(run.bold)html=`<strong>${html}</strong>`;
    return html;
  }).join("");
  return memoryBlocks(value).map(block=>block.kind==="heading"
    ?`<h${block.level+1}>${inline(block.text)}</h${block.level+1}>`
    :block.kind==="item"
      ?`<div class="memory-list-item" style="--memory-depth:${block.depth}"><span class="memory-list-marker">${block.number?e(block.number)+".":"•"}</span><div>${inline(block.text)}</div></div>`
      :`<p>${inline(block.text)}</p>`).join("");
}

/** Draw styled paragraphs with hanging list indents, wrapping and page breaks. */
export function drawMemoryPdf(pdf,value,{left,width,top,bottom,nextPage}) {
  let y=top;
  const font=(run,size)=>{
    pdf.setFont("helvetica",run.bold?(run.italic?"bolditalic":"bold"):(run.italic?"italic":"normal"));
    pdf.setFontSize(size);pdf.setTextColor(38,58,76);
  };
  for(const block of memoryBlocks(value)){
    const size=block.kind==="heading"?[15,12,11][block.level-1]:10.5;
    const height=size*0.352778*1.45,indent=block.kind==="item"?6+block.depth*5:0;
    const available=width-indent,lines=[[]];let used=0;
    const newLine=()=>{lines.push([]);used=0;};
    const append=(run,text,width)=>{
      const line=lines.at(-1),last=line.at(-1);
      if(last&&last.bold===run.bold&&last.italic===run.italic){last.text+=text;last.width+=width;}
      else line.push({...run,text,width});
    };
    const add=(text,run)=>{
      if(!text)return;
      font(run,size);let remaining=text;
      while(remaining){
        if(!used)remaining=remaining.replace(/^ +/,"");
        if(!remaining)break;
        const measured=pdf.getTextWidth(remaining);
        if(used+measured<=available){append(run,remaining,measured);used+=measured;break;}
        if(used){newLine();continue;}
        // A single unbroken word may be wider than the page.
        let part="";
        for(const char of remaining){if(part&&pdf.getTextWidth(part+char)>available)break;part+=char;}
        const width=pdf.getTextWidth(part);append(run,part,width);
        remaining=remaining.slice(part.length);used=width;if(remaining)newLine();
      }
    };
    for(const original of memoryInline(block.text)){
      const run={...original,bold:original.bold||block.kind==="heading"};
      for(const token of run.text.split(/(\n| +)/).filter(Boolean)){
        if(token==="\n")newLine();else add(token,run);
      }
    }
    // Keep a heading with at least the first following line when possible.
    if(y+height*(block.kind==="heading"?2:1)>bottom)y=nextPage();
    lines.forEach((line,index)=>{
      if(y+height>bottom)y=nextPage();
      if(block.kind==="item"&&index===0){font({bold:false,italic:false},size);pdf.text(block.number?block.number+".":"•",left+indent-5,y);}
      let x=left+indent;
      for(const run of line){font(run,size);pdf.text(run.text,x,y);x+=run.width;}
      y+=height;
    });
    y+=block.kind==="item"?1.2:block.kind==="heading"?2:3;
  }
  return y;
}
