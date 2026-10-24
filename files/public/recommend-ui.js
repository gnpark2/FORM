import {api} from './cloud-store.js';
const $ = selector => document.querySelector(selector);

export function addFeatureFields() {
  for (const prefix of ['garment', 'editGarment']) {
    const label = document.createElement('label');
    label.className = 'input-label'; label.htmlFor = prefix + 'Features'; label.textContent = '옷의 특징 · 추천에 사용';
    const input = document.createElement('input');
    input.id = prefix + 'Features'; input.maxLength = 240;
    input.placeholder = '예: 아이보리, 무지, 여름, 캐주얼, 면';
    $('#' + prefix + 'Url').after(label, input);
  }
}
export async function connectAccount(beforeLogout) {
  const account = await api('/api/auth/me'), link = $('#cloudLogin');
  link.href = account.loginUrl; link.textContent = account.loginLabel;
  if (account.user && !$('#accountControls')) {
    const box = document.createElement('span'); box.id = 'accountControls';
    const name = document.createElement('span'); name.textContent = account.user.name;
    const logout = document.createElement('button'); logout.textContent = '로그아웃';
    logout.onclick = async () => {
      logout.disabled = true;
      try {
        await beforeLogout();
        if (account.logoutUrl) window.top.location.href = account.logoutUrl;
        else { await api('/api/auth/logout', {method: 'POST'}); location.reload(); }
      } catch (e) { $('#cloudStatus').textContent = e.message; logout.disabled = false; }
    };
    box.append(name, logout); $('.cloud-bar').append(box);
  }
  if (!account.user) {
    const failed = new URL(location.href).searchParams.has('auth_error');
    throw Object.assign(new Error(failed ? 'Google 로그인을 완료하지 못했어요. 다시 시도해 주세요.' : '가입 / 로그인 후 나만의 옷장을 시작하세요.'), {status: 401});
  }
}
export function createRecommender({getGarments, getSelected, apply}) {
  const section = document.createElement('section'); section.className = 'recommend-panel';
  section.innerHTML = `<h2>오늘은 어떻게 입을까요?</h2>
    <p>내 옷장에서 조합을 추천받고 보드에 바로 놓아보세요. AI는 옷 사진 대신 입력한 이름·특징을 참고합니다.</p>
    <form id="recommendForm"><label for="recommendPrompt">원하는 분위기나 상황</label>
    <input id="recommendPrompt" maxlength="400" required placeholder="예: 아이보리 상의와 어울리는 가을 데이트 코디">
    <label class="check-label"><input type="checkbox" id="recommendAnchor"> 보드에서 최근 선택한 내 옷 포함<span id="recommendAnchorName"></span></label>
    <button class="btn primary" id="recommendSubmit">코디 추천받기 ✦</button></form>
    <p id="recommendStatus" role="status" aria-live="polite">AI는 하루 5회까지 · 같은 조건의 결과는 재사용해요.</p>
    <div id="recommendResults" class="recommend-results"></div>`;
  $('#studio .intro').after(section);
  let busy = false;
  $('#recommendForm').onsubmit = async e => {
    e.preventDefault(); if (busy) return;
    const selected = getSelected();
    if ($('#recommendAnchor').checked && (!selected || selected.source !== 'wardrobe')) {
      $('#recommendStatus').textContent = '보드에서 내 옷장에 등록한 옷을 먼저 선택해 주세요.'; return;
    }
    busy = true; $('#recommendSubmit').disabled = true;
    $('#recommendStatus').textContent = '내 옷장에서 어울리는 조합을 찾고 있어요…';
    $('#recommendResults').replaceChildren();
    try {
      const data = await api('/api/recommend', {method: 'POST', body: JSON.stringify({prompt: $('#recommendPrompt').value.trim(), anchorId: $('#recommendAnchor').checked ? selected.itemId : null})});
      $('#recommendStatus').textContent = data.source === 'ai' ? (data.cached ? '저장된 AI 추천을 불러왔어요. 추가 횟수는 차감되지 않아요.' : 'AI가 추천한 조합이에요. 마음에 드는 코디를 골라보세요.') : data.reason;
      for (const look of data.looks) {
        const card = document.createElement('article'), title = document.createElement('h3'), images = document.createElement('div'), reason = document.createElement('p'), button = document.createElement('button');
        card.className = 'recommend-card'; title.textContent = look.title; reason.textContent = look.reason; images.className = 'recommend-images';
        for (const id of look.ids) { const item = getGarments().find(g => g.id === id); if (!item) continue; const img = document.createElement('img'); img.src = item.image; img.alt = item.name; img.title = item.name; images.append(img); }
        button.className = 'btn secondary'; button.textContent = '보드에 적용';
        button.onclick = () => apply(look.ids);
        card.append(title, images, reason, button); $('#recommendResults').append(card);
      }
    } catch (error) { $('#recommendStatus').textContent = error.message; }
    finally { busy = false; $('#recommendSubmit').disabled = false; }
  };
}
