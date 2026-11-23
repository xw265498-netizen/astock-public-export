(function () {
  const STORAGE_KEY = 'astock_iam_user';

  const IamL2 = {
    currentUser: null,

    async init() {
      this.hookCallFn();
      this.renderContainers();
      const savedUsername = localStorage.getItem(STORAGE_KEY);
      const hasSession = typeof window.prepareIamSession === 'function'
        ? await window.prepareIamSession()
        : false;
      if (savedUsername && hasSession) {
        await this.refreshMe(savedUsername);
        if (this.currentUser && typeof window.startAppAfterIamLogin === 'function') {
          await window.startAppAfterIamLogin();
        }
      } else {
        this.showLoginModal(savedUsername ? '登录状态已失效，请重新登录' : '');
      }
    },

    hookCallFn() {
      const origCallFn = window.callFn;
      if (typeof origCallFn === 'function' && !origCallFn._l2Hooked) {
        const self = this;
        const wrapped = async function (params = {}) {
          const res = await origCallFn({ ...params });
          const data = (res && res.result) ? res.result : res;
          if (data && data.status === 403 && data.error === '账号已停用') {
            self.handleDisabledAccount();
          }
          return res;
        };
        wrapped._l2Hooked = true;
        window.callFn = wrapped;
      }
    },

    async invoke(params) {
      this.hookCallFn();
      if (typeof window.callFn === 'function') {
        const res = await window.callFn(params);
        return (res && res.result) ? res.result : res;
      }
      throw new Error('window.callFn 未定义');
    },

    async refreshMe(username) {
      try {
        const res = await this.invoke({ action: 'iam.me' });
        if (!res || !res.ok) {
          if (res && res.status === 403) {
            this.handleDisabledAccount(res.error || '账号已停用');
            return;
          }
          this.showLoginModal(res ? res.error : '请登录');
          return;
        }
        this.currentUser = res.user;
        localStorage.setItem(STORAGE_KEY, this.currentUser.username);
        this.applyRoleUI();
      } catch (e) {
        console.error('[IAM-L2] refreshMe error:', e);
      }
    },

    handleDisabledAccount(msg = '账号已停用') {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('CB_AUTH_TOKEN');
      this.currentUser = null;
      this.showLoginModal(msg);
    },

    renderContainers() {
      if (!document.getElementById('login')) {
        const loginDiv = document.createElement('div');
        loginDiv.id = 'login';
        document.body.appendChild(loginDiv);
      }
      if (!document.getElementById('accountPanel')) {
        const panelDiv = document.createElement('div');
        panelDiv.id = 'accountPanel';
        const appRoot = document.getElementById('app') || document.body;
        appRoot.prepend(panelDiv);
      }
    },

    showLoginModal(errorMsg = '') {
      const el = document.getElementById('login');
      if (!el) return;
      el.style.display = 'flex';
      el.innerHTML = `
        <div style="position:fixed;inset:0;background:radial-gradient(120% 90% at 50% 18%,#12304f 0%,#0a1828 42%,#03060a 100%);z-index:9999;display:flex;align-items:center;justify-content:center;">
          <div style="background:rgba(18,23,34,.86);border:1px solid rgba(212,175,105,.24);border-radius:22px;padding:26px 22px;width:340px;color:#E2E8F0;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;box-sizing:border-box;backdrop-filter:blur(18px);box-shadow:0 24px 60px rgba(0,0,0,.45);">
            <div style="text-align:center;margin-bottom:20px;">
              <img src="/icons/icon-192.png?v=3" alt="小满" style="width:84px;height:84px;border-radius:20px;display:block;margin:0 auto 12px;box-shadow:0 12px 32px rgba(0,0,0,.45);" />
              <div style="font-size:24px;font-weight:700;color:#fff;letter-spacing:3px;">小满</div>
              <div style="font-size:12.5px;color:#8B98A9;margin-top:3px;">账号登录</div>
            </div>
            <label style="display:block;font-size:12.5px;color:#94A3B8;margin:0 0 6px;">用户名</label>
            <input id="l2Username" type="text" autocomplete="username" placeholder="请输入用户名" style="width:100%;box-sizing:border-box;padding:11px 12px;border-radius:12px;border:1px solid rgba(148,163,184,.22);background:rgba(8,12,18,.8);color:#fff;outline:none;" />
            <label style="display:block;font-size:12.5px;color:#94A3B8;margin:14px 0 6px;">密码</label>
            <input id="l2Password" type="password" autocomplete="current-password" placeholder="请输入密码" style="width:100%;box-sizing:border-box;padding:11px 12px;border-radius:12px;border:1px solid rgba(148,163,184,.22);background:rgba(8,12,18,.8);color:#fff;outline:none;" />
            <div id="l2LoginErr" style="color:#E5484D;font-size:12.5px;margin-top:9px;min-height:17px;">${errorMsg}</div>
            <button id="l2LoginBtn" style="width:100%;margin-top:6px;padding:11px;border:none;border-radius:12px;background:#0A84FF;color:#fff;font-size:15px;font-weight:600;cursor:pointer;">登录</button>
          </div>
        </div>
      `;
      document.getElementById('l2LoginBtn').onclick = () => this.doLogin();
    },

    async doLogin() {
      const u = (document.getElementById('l2Username').value || '').trim();
      const p = document.getElementById('l2Password').value || '';
      const errEl = document.getElementById('l2LoginErr');
      const btn = document.getElementById('l2LoginBtn');
      if (!u || !p) {
        errEl.textContent = '请输入用户名和密码';
        return;
      }
      const fail = (msg) => {
        errEl.textContent = msg;
        if (btn) { btn.disabled = false; btn.textContent = '登录'; }
      };
      if (btn) { btn.disabled = true; btn.textContent = '登录中…'; }
      errEl.textContent = '正在登录…';

      try {
        if (typeof window.signInForIam !== 'function') throw new Error('登录模块未初始化');
        await window.signInForIam(u, p);
      } catch (e) {
        return fail(e && e.message ? e.message : '登录失败');
      }

      const res = await this.invoke({ action: 'iam.login' });
      if (!res || !res.ok) {
        return fail((res && res.error) ? res.error : '登录失败');
      }
      this.currentUser = res.user;
      localStorage.setItem(STORAGE_KEY, u);
      document.getElementById('login').style.display = 'none';
      document.getElementById('login').innerHTML = '';
      this.applyRoleUI();
      if (typeof window.startAppAfterIamLogin === 'function') {
        await window.startAppAfterIamLogin();
      }
    },

    applyRoleUI() {
      const u = this.currentUser;
      if (!u) return;

      const panel = document.getElementById('accountPanel');
      if (panel) {
        const isOwner = u.role === 'owner';
        panel.innerHTML = `
          <div style="background:rgba(10,10,11,.86);border-bottom:1px solid #1c1c1e;padding:7px 12px;display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;justify-content:space-between;color:#f2f2f7;font-size:12.5px;backdrop-filter:blur(18px) saturate(160%);">
            <div style="display:flex;align-items:center;gap:8px;min-width:0;">
              <button id="l2AvatarBtn" title="点击更换我的头像" style="width:26px;height:26px;padding:0;border:0;border-radius:50%;background:transparent;overflow:hidden;flex:0 0 26px;cursor:pointer;">
                <img id="l2Avatar" alt="头像" style="width:26px;height:26px;border-radius:50%;object-fit:cover;display:block;border:1px solid #3a3a3c;" />
              </button>
              <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:42vw;"><strong id="l2HeaderDisplay" style="color:#fff;font-weight:600;">${u.display}</strong></span>
              <span style="padding:1px 6px;border-radius:5px;background:#2c2c2e;color:#aeaeb2;font-size:10.5px;white-space:nowrap;">${u.role === 'owner' ? '主号' : u.role === 'debug' ? '调试' : '子号'}</span>
              <span style="color:#8e8e93;white-space:nowrap;font-size:11.5px;">今日 ${u.used_today || 0}/${u.daily_quota}</span>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
              <button id="l2SelfPwdBtn" style="padding:2px 0;border:0;background:transparent;color:#0a84ff;font-size:12px;cursor:pointer;">我的密码</button>
              ${isOwner ? `<button id="l2OpenAdminBtn" style="padding:2px 0;border:0;background:transparent;color:#0a84ff;font-size:12px;cursor:pointer;">账号中心</button>` : ''}
              <button id="l2LogoutBtn" style="padding:2px 0;border:0;background:transparent;color:#8e8e93;font-size:12px;cursor:pointer;">切换账号</button>
            </div>
          </div>
          <div id="l2AdminDrawer" style="display:none;background:#0b0b0c;border-bottom:1px solid #2c2c2e;padding:16px;color:#f2f2f7;"></div>
          <input id="l2AvatarFile" type="file" accept="image/*" class="hide" />
        `;

        this.applyAvatar(u);
        document.getElementById('l2SelfPwdBtn').onclick = () => this.promptSelfPwd();
        document.getElementById('l2AvatarBtn').onclick = () => document.getElementById('l2AvatarFile').click();
        document.getElementById('l2AvatarFile').onchange = (e) => this.changeAvatar(e, u);

        document.getElementById('l2LogoutBtn').onclick = async () => {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem('CB_AUTH_TOKEN');
          this.currentUser = null;
          const app = document.getElementById('app');
          if (app) app.classList.add('hide');
          try {
            if (window.auth && typeof window.auth.signOut === 'function') window.auth.signOut().catch(()=>{});
          } catch (e) {}
          setTimeout(() => location.replace('/?logout=' + Date.now()), 60);
        };

        if (isOwner) {
          document.getElementById('l2OpenAdminBtn').onclick = () => this.toggleAdminDrawer();
        }
      }

      const chatInputs = document.querySelectorAll('input[type="text"]:not(#l2Username), textarea, #chatInput, #msgInput');
      chatInputs.forEach(inp => {
        if (inp.id && (inp.id.toLowerCase().includes('code') || inp.id.toLowerCase().includes('cash'))) return;
        if (u.role === 'debug') {
          inp.disabled = true;
          inp.placeholder = '调试号仅可跑数据与回测';
          inp.value = '';
        } else {
          inp.disabled = false;
        }
      });

      const send = document.getElementById('send');
      const mic = document.getElementById('mic');
      const newSess = document.getElementById('newSess');
      if (send) {
        send.disabled = u.role === 'debug';
        send.classList.toggle('readonly', u.role === 'debug');
        send.textContent = u.role === 'debug' ? '🔒' : '↑';
        send.title = u.role === 'debug' ? '调试号只读' : '发送';
      }
      if (mic) mic.disabled = u.role === 'debug';
      if (newSess) newSess.style.display = u.role === 'debug' ? 'none' : '';
    },

    applyAvatar(u) {
      const img = document.getElementById('l2Avatar');
      if (!img) return;
      const key = 'astock_avatar_' + u.username;
      let saved = null;
      try { saved = localStorage.getItem(key); } catch (e) {}
      img.src = saved || '/icons/icon-192.png?v=3';
    },

    changeAvatar(e, u) {
      const file = e.target && e.target.files && e.target.files[0];
      if (!file) return;
      if (!/^image\//.test(file.type || '')) {
        alert('请选择图片文件');
        e.target.value = '';
        return;
      }
      const key = 'astock_avatar_' + u.username;
      const fr = new FileReader();
      fr.onload = () => {
        const im = new Image();
        im.onload = () => {
          try {
            const side = Math.min(im.width, im.height);
            const c = document.createElement('canvas');
            c.width = 128; c.height = 128;
            c.getContext('2d').drawImage(im, (im.width - side) / 2, (im.height - side) / 2, side, side, 0, 0, 128, 128);
            const data = c.toDataURL('image/jpeg', 0.82);
            localStorage.setItem(key, data);
            const avatar = document.getElementById('l2Avatar');
            if (avatar) avatar.src = data;
          } catch (err) {
            alert('头像保存失败：浏览器存储空间不足');
          }
        };
        im.onerror = () => alert('图片读取失败');
        im.src = fr.result;
      };
      fr.onerror = () => alert('图片读取失败');
      fr.readAsDataURL(file);
      e.target.value = '';
    },

    async toggleAdminDrawer() {
      const drawer = document.getElementById('l2AdminDrawer');
      if (!drawer) return;
      if (drawer.style.display === 'block') {
        drawer.style.display = 'none';
        return;
      }
      drawer.style.display = 'block';
      drawer.innerHTML = '加载子账号列表中...';
      const res = await this.invoke({ action: 'iam.listSubs' });
      if (!res || !res.ok) {
        drawer.innerHTML = `<span style="color:#E5484D;">加载失败: ${res ? res.error : ''}</span>`;
        return;
      }

      const rows = (res.users || []).map(item => `
        <tr style="border-bottom:1px solid #1E293B;">
          <td style="padding:8px;">${item.username}</td>
          <td style="padding:8px;">${item.role}</td>
          <td style="padding:8px;">
            <input id="disp_${item.username}" value="${item.display || ''}" style="background:#121722;border:1px solid #334155;color:#fff;padding:4px 6px;border-radius:4px;width:110px;" />
          </td>
          <td style="padding:8px;">
            <input id="quota_${item.username}" type="number" value="${item.daily_quota || 200}" style="background:#121722;border:1px solid #334155;color:#fff;padding:4px 6px;border-radius:4px;width:70px;" />
            <span style="font-size:11px;color:#64748B;">(已用 ${item.used_today || 0})</span>
          </td>
          <td style="padding:8px;">
            <span style="color:${item.active ? '#30A46C' : '#E5484D'};">${item.active ? '启用' : '已停用'}</span>
          </td>
          <td style="padding:8px;">
            <button onclick="window.IamL2.saveSub('${item.username}')" style="padding:3px 8px;background:#3B82F6;color:#fff;border:none;border-radius:4px;cursor:pointer;margin-right:4px;">保存</button>
            ${item.role !== 'owner' ? `<button onclick="window.IamL2.toggleSub('${item.username}', ${!item.active})" style="padding:3px 8px;background:${item.active ? '#E5484D' : '#30A46C'};color:#fff;border:none;border-radius:4px;cursor:pointer;margin-right:4px;">${item.active ? '停用' : '启用'}</button>` : ''}
            <button onclick="window.IamL2.promptResetPwd('${item.username}')" style="padding:3px 8px;background:#334155;color:#E2E8F0;border:none;border-radius:4px;cursor:pointer;">改密</button>
          </td>
        </tr>
      `).join('');

      drawer.innerHTML = `
        <div style="margin-bottom:8px;font-weight:600;">账号中心（1 主 + 5 子 + 1 调试）</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;text-align:left;">
          <thead>
            <tr style="border-bottom:1px solid #334155;color:#94A3B8;">
              <th style="padding:6px;">用户名</th>
              <th style="padding:6px;">角色</th>
              <th style="padding:6px;">显示名</th>
              <th style="padding:6px;">日配额</th>
              <th style="padding:6px;">状态</th>
              <th style="padding:6px;">操作</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    },

    async saveSub(targetUser) {
      const display = document.getElementById(`disp_${targetUser}`).value;
      const daily_quota = Number(document.getElementById(`quota_${targetUser}`).value);
      const res = await this.invoke({ action: 'iam.updateSub', targetUser, display, daily_quota });
      if (res && res.ok) {
        alert(`已更新 ${targetUser}`);
        this.toggleAdminDrawer();
        this.toggleAdminDrawer();
      } else {
        alert(res ? res.error : '更新失败');
      }
    },

    async toggleSub(targetUser, active) {
      const res = await this.invoke({ action: 'iam.toggle', targetUser, active });
      if (res && res.ok) {
        this.toggleAdminDrawer();
        this.toggleAdminDrawer();
      } else {
        alert(res ? res.error : '操作失败');
      }
    },

    validPwd(p) {
      if (!p || p.length < 8 || p.length > 32) return false;
      const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(re => re.test(p)).length;
      return kinds >= 3;
    },

    async doChangePwd(targetUser) {
      if (typeof window.changeCloudPwd !== 'function') {
        alert('改密模块未加载，请刷新页面重试');
        return;
      }
      const oldPwd = prompt('输入 ' + targetUser + ' 的当前密码');
      if (oldPwd === null) return;
      if (!oldPwd) { alert('当前密码不能为空'); return; }
      const newPwd = prompt('输入新密码（8-32 位，大写/小写/数字/符号至少 3 类）');
      if (newPwd === null) return;
      if (!this.validPwd(newPwd)) { alert('新密码不符合要求：8-32 位，大写/小写/数字/符号至少 3 类'); return; }
      try {
        await window.changeCloudPwd(targetUser, oldPwd, newPwd);
        alert(targetUser + ' 的密码已修改。下次登录请用新密码。');
      } catch (e) {
        alert('改密失败：' + (e && e.message ? e.message : '未知错误'));
      }
    },

    async promptSelfPwd() {
      if (!this.currentUser) return;
      await this.doChangePwd(this.currentUser.username);
    },

    async promptResetPwd(targetUser) {
      await this.doChangePwd(targetUser);
    },

    async dbList(table = 'watchlist', filter = {}) {
      return await this.invoke({ action: 'db.list', table, filter });
    },
    async dbPut(table = 'watchlist', data = {}, id = undefined) {
      return await this.invoke({ action: 'db.put', table, data, id });
    },
    async dbDel(table = 'watchlist', { id, code } = {}) {
      return await this.invoke({ action: 'db.del', table, id, code });
    }
  };

  window.IamL2 = IamL2;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => IamL2.init());
  } else {
    IamL2.init();
  }
})();