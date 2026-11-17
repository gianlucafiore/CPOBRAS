/** Render ²/³ as raised digits with the current font, independent of its glyph encoding. */
export function createPdf(jsPDF,options){
  const pdf=new jsPDF(options),draw=pdf.text.bind(pdf);
  pdf.text=function(value,x,y,options,...rest){
    if(!/[²³]/u.test(String(value)))return draw(value,x,y,options,...rest);
    const lines=Array.isArray(value)?value:String(value).split("\n"),size=pdf.getFontSize(),scale=pdf.internal.scaleFactor;
    const opts=options||{},lineHeight=size*pdf.getLineHeightFactor()/scale;
    try{
      lines.forEach((line,index)=>{
        const runs=String(line).split(/([²³])/u).filter(Boolean).map(text=>({text:text==='²'?'2':text==='³'?'3':text,raised:/^[²³]$/u.test(text)}));
        let width=0;
        for(const run of runs){pdf.setFontSize(run.raised?size*0.65:size);run.width=pdf.getTextWidth(run.text);width+=run.width;}
        let left=x-(opts.align==='right'?width:opts.align==='center'?width/2:0);
        for(const run of runs){
          pdf.setFontSize(run.raised?size*0.65:size);
          draw(run.text,left,y+index*lineHeight-(run.raised?size*0.34/scale:0),{...opts,align:'left'},...rest);
          left+=run.width;
        }
      });
    }finally{pdf.setFontSize(size);}
    return pdf;
  };
  return pdf;
}
