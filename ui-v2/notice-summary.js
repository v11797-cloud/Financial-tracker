/* Official notice excerpts; never infer proposal details from a title. */
(() => {
  const pending = new Map();
  const load = kind => {
    if (!pending.has(kind)) pending.set(kind, fetch(`./data/${kind}_summaries.json`, {cache:'no-cache'})
      .then(r => { if (!r.ok) throw new Error('unavailable'); return r.json(); })
      .catch(() => { pending.delete(kind); return null; }));
    return pending.get(kind);
  };
  function section(host, heading, text, max) {
    const part = document.createElement('section'); part.className = 'brief-section';
    const title = document.createElement('h3'); title.textContent = heading; part.append(title);
    const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
    const list = document.createElement('ul');
    for (const line of lines.slice(0,max)) {
      const li = document.createElement('li'); li.textContent = line; list.append(li);
    }
    part.append(list);
    if (lines.length > max) {
      const details = document.createElement('details'), label = document.createElement('summary'), body = document.createElement('p');
      label.textContent = '나머지 내용 펼치기'; body.textContent = lines.slice(max).join('\n'); body.style.whiteSpace = 'pre-line';
      details.append(label,body); part.append(details);
    }
    host.append(part);
  }
  function mountKofia(item) {
    const ai = document.getElementById('ai-detail-section');
    const host = document.createElement('section'); host.className = 'ai-detail'; host.id = 'notice-summary'; host.setAttribute('aria-live','polite');
    host.textContent = '협회 제·개정 원문을 불러오는 중입니다…'; ai.before(host); ai.hidden = true;
    const original = `https://law.kofia.or.kr/service/revision/revisionView.do?historySeq=${encodeURIComponent(item.history_seq || '')}`;
    load('kofia').then(payload => {
      if (!host.isConnected) return;
      host.replaceChildren();
      const heading = document.createElement('h3'); heading.textContent = '협회 규정 제·개정 요약'; host.append(heading);
      const record = payload?.schema_version === 1 && payload.source === 'KOFIA' ? payload.items?.[item.id] : null;
      const valid = /^kofia_revision_\d{1,12}$/.test(item.id) && item.id === `kofia_revision_${item.history_seq}` && /^\d{1,12}$/.test(String(item.law_seq || '')) && ['협회규정','모범규준'].includes(item.source_group) && record && ['id','title','date','law_seq','history_seq','source_group'].every(k=>record[k] === item[k]);
      const kind = record?.kind, content = typeof record?.text === 'string' ? record.text.trim() : '';
      let contentUrl = '';
      try {
        const url = new URL(record?.content_url || '');
        const same = url.protocol === 'https:' && url.hostname === 'law.kofia.or.kr' && !url.port && !url.username && !url.password;
        if (same && ((kind === 'revision_summary' && url.href === original) ||
          (kind === 'amendment_document' && url.pathname === '/download.do' && url.searchParams.get('gubun') === '104' && /^\d{1,12}$/.test(url.searchParams.get('seq') || '')) ||
          (kind === 'version_fulltext' && url.pathname === '/service/law/lawFullScreenContent.do' && url.searchParams.get('seq') === String(item.law_seq) && url.searchParams.get('historySeq') === String(item.history_seq)))) contentUrl = url.href;
      } catch {}
      if (!valid || record.status !== 'ready' || !content || !contentUrl || record.source_url !== original) {
        const p = document.createElement('p'); p.textContent = valid && record.status === 'pending'
          ? '이 제·개정 건은 협회 원문 수집 대기 중입니다. 자동 수집 후 이 화면에 연결됩니다.'
          : valid && record.status === 'not_provided'
            ? '협회 원문에 표시할 요약 본문이 없습니다. 아래 협회 원문과 개정문 첨부파일을 확인해 주세요.'
            : '협회 원문 수집 또는 제·개정 건 확인을 완료하지 못했습니다. 다음 자동 수집 때 다시 시도합니다.';
        host.append(p); return;
      }
      const full = kind === 'version_fulltext', note = document.createElement('p'); note.className = 'brief-meta';
      note.textContent = full ? '협회가 제공하는 해당 제·개정 시점의 전문 발췌입니다. 변경 전후 차이를 요약한 내용은 아닙니다.' : kind === 'amendment_document' ? '금융투자협회의 해당 제·개정 건에 연결된 개정문 첨부파일에서 발췌했습니다.' : '금융투자협회의 해당 제·개정 건 요약문에서 발췌했습니다.';
      host.append(note); section(host, full ? '해당 시점 규정 내용' : '제·개정 취지 및 주요 내용',content,8);
      const source = document.createElement('a'); source.className = 'small-button'; source.textContent = kind === 'amendment_document' ? '협회 개정문 파일 보기 ↗' : full ? '해당 시점 전문 보기 ↗' : '협회 요약 원문 보기 ↗'; source.href = contentUrl; source.target = '_blank'; source.rel = 'noopener noreferrer'; host.append(source);
      const foot = document.createElement('p'); foot.className = 'brief-meta'; foot.textContent = `원문 수집 ${record.collected_at || '시각 미확인'}${record.source_note ? ' · '+record.source_note : ''}${record.truncated ? ' · 긴 원문의 앞부분만 표시합니다.' : ''} · 세부 조문·표·시행일은 협회 원문을 확인해 주세요.`; host.append(foot);
    });
  }
  function mountLaw(item) {
    const ai = document.getElementById('ai-detail-section');
    const host = document.createElement('section'); host.className = 'ai-detail'; host.id = 'notice-summary';
    const heading = document.createElement('h3'); heading.textContent = item.source === 'KOFIA' ? '협회 규정 제·개정 요약' : '공포·시행법령 요약'; host.append(heading);
    ai.before(host); ai.hidden = true;
    const payload = window.lawReasons;
    const record = payload?.schema_version === 1 ? payload.items?.[item.id] : null;
    const valid = record && ['id','law_name','prom_no','date'].every(key => record[key] === item[key]);
    // Resolve the amendment's full text independently of summary availability.
    const link = document.querySelector('#detail-content .brief-cta a');
    if (valid) {
      try {
        const url = new URL(record.original_url || record.source_url);
        const admin = url.searchParams.has('admRulSeq');
        const key = admin ? 'admRulSeq' : 'lsiSeq';
        const seq = url.searchParams.get(key);
        if (link && url.protocol === 'https:' && url.hostname === 'www.law.go.kr' && /^\d+$/.test(seq || '')) {
          link.href = `https://www.law.go.kr/LSW/${admin ? 'admRulInfoP' : 'lsInfoP'}.do?${key}=${seq}&chrClsCd=010201`;
        }
      } catch {}
    }
    if (!valid || record.status !== 'available' || !record.text) {
      const p = document.createElement('p'); p.textContent = '이 제·개정 건은 아직 공식 원문 요약을 제공하지 못합니다. 아래 공식 원문에서 제·개정이유와 세부 조문을 확인해 주세요.'; host.append(p); return;
    }
    const note = document.createElement('p'); note.className = 'brief-meta'; note.textContent = '국가법령정보센터의 해당 제·개정이유에서 발췌'; host.append(note);
    section(host,'제·개정 취지 및 주요 내용',record.text,8);
    const foot = document.createElement('p'); foot.className = 'brief-meta'; foot.textContent = '세부 조문·부칙·조항별 시행일은 공식 원문을 확인해 주세요.'; host.append(foot);
  }
  window.RegWatchNotice = { mount(item) {
    if (item.source === 'KOFIA' && item.category === '공포법령') { mountKofia(item); return; }
    if (item.category === '공포법령') { mountLaw(item); return; }
    if (!['입법예고','보도자료'].includes(item.category)) return;
    const press = item.category === '보도자료';
    const ai = document.getElementById('ai-detail-section');
    const host = document.createElement('section'); host.className = 'ai-detail'; host.id = 'notice-summary'; host.setAttribute('aria-live','polite');
    host.textContent = press ? '보도자료 내용을 불러오는 중입니다…' : '입법예고 내용을 불러오는 중입니다…'; ai.before(host); ai.hidden = true;
    load(press ? 'press' : 'notice').then(payload => {
      if (!host.isConnected) return;
      const record = payload?.schema_version === 1 ? payload.items?.[item.id] : null;
      host.replaceChildren();
      const heading = document.createElement('h3'); heading.textContent = press ? '보도자료 요약' : '입법예고안 요약'; host.append(heading);
      if (!record || record.status !== 'ready' || record.title !== item.title || record.date !== item.date) {
        const p = document.createElement('p'); p.textContent = press ? '이 보도자료는 아직 본문 요약을 제공하지 못합니다. 아래 공식 원문과 첨부자료를 확인해 주세요.' : '이 예고안은 아직 본문 요약을 제공하지 못합니다. 아래 공식 원문과 첨부된 개정안을 확인해 주세요.'; host.append(p); return;
      }
      const note = document.createElement('p'); note.className = 'brief-meta'; note.textContent = press ? '공식 보도자료 본문에서 핵심 문단 발췌' : '공식 예고문에서 발췌 · 확정된 규정이 아닌 개정안입니다.'; host.append(note);
      if (record.purpose) section(host,press ? '핵심 내용' : '개정 취지',record.purpose,3);
      if (record.changes) section(host,press ? '주요 발표 내용' : '주요 변경 내용',record.changes,5);
      const foot = document.createElement('p'); foot.className = 'brief-meta'; foot.textContent = press ? '보도자료 본문 기준입니다. 세부 수치·표·붙임자료는 공식 원문을 확인해 주세요.' : '예고문 본문 기준입니다. 세부 조문과 예외는 원문 첨부자료를 확인해 주세요.'; host.append(foot);
    });
  }};
})();
