/* Read report text inside a detached template. Never render imported HTML. */
'use strict';
(function (root) {
  const text = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const dna = el => text(el).replace(/\s/g, '').toUpperCase();
  const valid = (s, min, max) => s.length >= min && s.length <= max && /^[ACGT]+$/.test(s);
  const reverse = s => [...s].reverse().map(b => ({ A:'T', C:'G', G:'C', T:'A' }[b])).join('');

  function parse(html) {
    if (typeof html !== 'string' || html.length > 5_000_000) throw Error('Design report must be smaller than 5 MB.');
    const template = document.createElement('template');
    template.innerHTML = html;
    const fragment = template.content;
    fragment.querySelectorAll('script,style,iframe,object,embed,link,meta,svg').forEach(el => el.remove());
    const nodes = [...fragment.querySelectorAll('*')];
    const headings = nodes.filter(el => el.tagName === 'H1');
    const sections = nodes.filter(el => el.tagName === 'H2');
    const designs = [];
    // Scope each guide section to its design, and each donor to its own h3 block.
    for (const heading of sections.filter(el => /gRNA\s+Sequences/i.test(text(el)))) {
      const index = nodes.indexOf(heading);
      const start = [...headings].reverse().find(el => nodes.indexOf(el) < index);
      const end = headings.find(el => nodes.indexOf(el) > index);
      const stop = end ? nodes.indexOf(end) : nodes.length;
      const nextSection = sections.find(el => nodes.indexOf(el) > index);
      const guideEnd = nextSection ? nodes.indexOf(nextSection) : stop;
      const guides = [];
      for (const tr of nodes.slice(index + 1, guideEnd).filter(el => el.tagName === 'TR')) {
        const cells = [...tr.children].filter(el => /^(TD|TH)$/.test(el.tagName));
        if (cells.length < 2 || /^name$/i.test(text(cells[0]))) continue;
        const parts = text(cells[1]).toUpperCase().split(/\s+/).filter(Boolean);
        let sequence = parts[0] || '';
        // Designer exports spacer and PAM in separate spans, or as 20+3 bases.
        if (parts.length === 1 && sequence.length === 23 && /GG$/.test(sequence)) sequence = sequence.slice(0,20);
        if (!valid(sequence, 20, 20)) continue;
        if (!guides.some(g => g.sequence === sequence)) guides.push({ name:text(cells[0]), sequence });
      }
      const donorSection = sections.find(el => nodes.indexOf(el)>index && nodes.indexOf(el)<stop && /(?:ssODN\s+Donor\s+Templates|Donor\s+Design)/i.test(text(el)));
      const donors = [];
      if (donorSection) {
        const donorStart = nodes.indexOf(donorSection);
        const next = sections.find(el => nodes.indexOf(el)>donorStart);
        const donorEnd = Math.min(stop, next ? nodes.indexOf(next) : stop);
        const donorNodes = nodes.slice(donorStart+1, donorEnd);
        for (const label of donorNodes) {
          if (label.children.length || !/^(?:Donor|Donor ssODN)$/i.test(text(label))) continue;
          const sequence = dna(label.nextElementSibling);
          if (!valid(sequence, 30, 4000)) continue;
          const nameHeading = [...donorNodes].reverse().find(el => el.tagName==='H3' && nodes.indexOf(el)<nodes.indexOf(label));
          const name = text(nameHeading) || 'ssODN donor';
          // Same donor can be printed as ordered and opposite reference strands.
          if (donors.some(d => d.name===name && (d.sequence===sequence || d.sequence===reverse(sequence)))) continue;
          const card = label.parentElement?.parentElement;
          const recommended = /Order this strand|Recommended to order/i.test(text(card));
          donors.push({ name, sequence, recommended });
        }
      }
      if (guides.length) designs.push({ title:text(start) || 'Assured design', guides, donors });
    }
    if (!designs.length) throw Error('No supported Assured Design gRNA section found. Upload the exported design HTML report; PDF and order sheets are not supported.');
    return designs;
  }
  root.TraceEditDesign = { parse };
})(globalThis);
