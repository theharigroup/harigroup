
// Publication card design and filtering logic.
// Add/edit publications ONLY in the hidden #publication-data table in publications.html.
document.addEventListener('DOMContentLoaded', () => {
  const table = document.getElementById('publication-data');
  if (!table) return;
  const columns = ['year','subject','citation','doi','title','authors','date','abstract','image'];
  const records = Array.from(table.tBodies[0].rows).map(row =>
    Object.fromEntries(columns.map((key,i) => [key, row.cells[i]?.textContent.trim() || '']))
  );
  const year = document.getElementById('pub-year');
  const subject = document.getElementById('pub-subject');
  const search = document.getElementById('pub-search');
  const output = document.getElementById('publications-container');
  const empty = document.getElementById('pub-empty');
  const esc = value => String(value).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const unique = key => [...new Set(records.map(r=>r[key]).filter(Boolean))];
  unique('year').sort((a,b)=>Number(b)-Number(a)).forEach(y=>year.add(new Option(y,y)));
  unique('subject').sort().forEach(s=>subject.add(new Option(s,s)));
  function render() {
    const term=search.value.trim().toLowerCase();
    const selected=records.filter(r=>
      (!year.value || r.year===year.value) &&
      (!subject.value || r.subject===subject.value) &&
      (!term || Object.values(r).some(v=>v.toLowerCase().includes(term)))
    );
    output.replaceChildren();
    selected.forEach(r=>{
      const article=document.createElement('article');
      article.className='pub-card';
      const doi=r.doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'');
      const doiLink=/^10\.\d{4,9}\/\S+$/.test(doi)
        ? `<a class="pub-doi" href="https://doi.org/${encodeURI(doi).replace(/"/g,'%22')}" target="_blank" rel="noopener noreferrer">DOI: ${esc(doi)} ↗</a>`
        : '<span class="text-slate-400 text-xs">DOI not supplied</span>';
      article.innerHTML=`
        <div class="pub-top"><span class="pub-citation">${esc(r.citation)}</span>${doiLink}</div>
        <div class="pub-body">
          <h2 class="pub-title">${esc(r.title)}</h2>
          <div class="pub-authors">${esc(r.authors)}</div>
          <div class="pub-date">Published: ${esc(r.date)}</div>
          <div class="pub-content">
            <div class="pub-abstract"><h3>Abstract</h3><p>${esc(r.abstract)}</p></div>
            <div class="pub-figure">${r.image?`<img class="pub-image" src="${esc(r.image)}" alt="Graphical abstract for ${esc(r.title)}" loading="lazy"/>`:''}</div>
          </div>
        </div>`;
      const img=article.querySelector('.pub-image');
      if(img) img.addEventListener('error',()=>{
        img.replaceWith(Object.assign(document.createElement('p'),{
          className:'pub-image-missing',
          textContent:`Graphical abstract not found: ${r.image}. Add the image at this path in your repository.`
        }));
      });
      output.append(article);
    });
    empty.classList.toggle('hidden',selected.length!==0);
  }
  [year,subject,search].forEach(el=>el.addEventListener(el===search?'input':'change',render));
  render();
});
