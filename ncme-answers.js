// ==UserScript==
// @name         NCME 答题页面答案显示（内联高亮版）
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  提交后抓取答案并在题目后显示；点击选项时正确标绿、错误标红；支持单选/多选/判断
// @match        *://*.ncme.org.cn/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  /***** 配置区（如需适配其他页面可在此调整） *****/
  const STORAGE_KEY = 'ncme_answers';
  // 题目容器选择器（尽量兼容多版本）
  const QUESTION_SELECTOR = '.question-item, .past-body .question-item, [data-code], [data-id]';
  // 选项输入控件选择器
  const OPTION_INPUT_SELECTOR = 'input[type="radio"], input[type="checkbox"]';

  /***** 工具方法 *****/
  const safeJSONParse = (str, def = {}) => {
    try { return JSON.parse(str); } catch { return def; }
  };

  const answersStore = {
    get() { return safeJSONParse(localStorage.getItem(STORAGE_KEY) || '{}'); },
    set(obj) { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj || {})); },
    merge(obj) {
      const curr = this.get();
      this.set(Object.assign(curr, obj || {}));
    }
  };

  const log = (...args) => console.log('[NCME-Answer]', ...args);

  /***** 拦截提交接口，抓取并保存答案（submitPaper / queryReport） *****/
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._url = url || '';
    return origOpen.call(this, method, url, ...rest);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
    this.addEventListener('load', function () {
      try {
        const url = this._url || '';
        if (url.includes('/exam/paper/submitPaper') || url.includes('/exam/paper/queryReport')) {
          const data = safeJSONParse(this.responseText, null);
          const modules = data?.data?.moduleList;
          if (Array.isArray(modules)) {
            const out = {};
            modules.forEach(m => {
              (m.questionList || []).forEach(q => {
                // 统一结构：code, title, answer(array), optionalContent(array?)
                const rec = {
                  title: q.title || '',
                  answer: Array.isArray(q.answer) ? q.answer : (q.answer != null ? [q.answer] : []),
                  optionalContent: Array.isArray(q.optionalContent) ? q.optionalContent.map(o => ({
                    mark: o.mark,
                    chooseContent: o.chooseContent
                  })) : undefined
                };
                if (q.code) out[q.code] = rec;
              });
            });
            answersStore.merge(out);
            log('✅ 已保存答案项数：', Object.keys(out).length);
            // 提交后立刻渲染
            scheduleRender();
          } else {
            log('⚠️ 提交响应未包含 moduleList');
          }
        }
      } catch (e) {
        log('解析提交响应失败：', e);
      }
    });
    return origSend.call(this, body);
  };

  /***** 渲染：在题目后显示答案提示 + 选项点击高亮 *****/
  function renderInlineAnswers() {
    const answers = answersStore.get();
    if (!Object.keys(answers).length) {
      log('暂无答案数据，等待提交后或手动注入。');
      return;
    }

    const items = document.querySelectorAll(QUESTION_SELECTOR);
    let bindCount = 0;

    items.forEach(item => {
      // 尝试从属性中提取唯一题目 code
      const code = item.getAttribute('data-code') || item.getAttribute('data-id');
      if (!code || !answers[code]) return;

      const ansList = answers[code].answer || [];
      const tipId = `ncme-inline-tip-${code}`;

      // 创建或更新题目下提示区域
      let tip = item.querySelector(`#${CSS.escape(tipId)}`);
      if (!tip) {
        tip = document.createElement('div');
        tip.id = tipId;
        tip.style.cssText = 'margin-top:6px;font-size:13px;';
        item.appendChild(tip);
      }
      tip.innerHTML = `
        <span style="color:#666;">正确答案：</span>
        <span style="color:#0a8f08;font-weight:bold;">${ansList.join(', ') || '-'}</span>
      `;

      // 给选项绑定点击高亮（正确绿色、错误红色）
      const options = item.querySelectorAll(OPTION_INPUT_SELECTOR);
      options.forEach(input => {
        // 推断选项的“标记”来源：value 或 data-mark 或文字中抽取
        const mark = input.getAttribute('data-mark')
          || input.value
          || (() => {
               const labelText = input.closest('label')?.textContent || '';
               const m = labelText.trim().match(/^[A-E]/i);
               return m ? m[0].toUpperCase() : null;
             })();

        if (!mark) return;

        // 避免重复绑定
        if (!input.__ncmeBound) {
          input.__ncmeBound = true;
          input.addEventListener('click', () => {
            const labelEl = input.closest('label') || input.parentElement;
            if (!labelEl) return;
            if (ansList.includes(mark)) {
              labelEl.style.color = '#0a8f08'; // 绿
              labelEl.style.fontWeight = 'bold';
            } else {
              labelEl.style.color = '#d72638'; // 红
              labelEl.style.fontWeight = 'bold';
            }
          });
          bindCount++;
        }

        // 初始状态可轻度提示（非强制着色，避免页面初始污染）
        const labelEl = input.closest('label') || input.parentElement;
        if (labelEl) {
          labelEl.style.transition = 'color 0.2s ease';
        }
      });
    });

    log(`✅ 渲染完成：题目内联提示更新，绑定事件数量：${bindCount}`);
  }

  // 避免 Vue/Nuxt 渲染覆盖，使用 MutationObserver 做增量重渲染
  let observer;
  function observeQuestions() {
    if (observer) return;
    const root = document.body;
    observer = new MutationObserver((mutations) => {
      // 对新增节点或题目容器变化尝试重新渲染
      const need = mutations.some(m => {
        return Array.from(m.addedNodes || []).some(n => {
          if (!(n instanceof Element)) return false;
          return n.matches?.(QUESTION_SELECTOR) || n.querySelector?.(QUESTION_SELECTOR);
        });
      });
      if (need) scheduleRender();
    });
    observer.observe(root, { childList: true, subtree: true });
  }

  // 防抖的渲染调度
  let renderTimer = null;
  function scheduleRender(delay = 300) {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderInlineAnswers, delay);
  }

  /***** 控制按钮（显示/隐藏提示、重新匹配） *****/
  function mountControls() {
    if (document.getElementById('ncme-ans-controls')) return;
    const ctrl = document.createElement('div');
    ctrl.id = 'ncme-ans-controls';
    ctrl.style.cssText = `
      position:fixed;top:20px;right:20px;z-index:999999;
      display:flex;gap:8px;flex-wrap:wrap;
    `;

    const mkBtn = (text, bg, handler) => {
      const btn = document.createElement('button');
      btn.textContent = text;
      btn.style.cssText = `
        background:${bg};color:#fff;border:0;border-radius:6px;
        padding:8px 12px;cursor:pointer;font-size:13px;
        box-shadow:0 2px 6px rgba(0,0,0,.2)
      `;
      btn.addEventListener('click', handler);
      return btn;
    };

    // 重新渲染
    ctrl.appendChild(mkBtn('重新匹配答案', '#007bff', () => scheduleRender(0)));
    // 隐藏/显示所有内联提示
    ctrl.appendChild(mkBtn('显示/隐藏提示', '#6c757d', () => {
      document.querySelectorAll('[id^="ncme-inline-tip-"]').forEach(el => {
        el.style.display = (el.style.display === 'none' ? 'block' : 'none');
      });
    }));
    // 清除颜色（恢复默认）
    ctrl.appendChild(mkBtn('清除颜色', '#dc3545', () => {
      document.querySelectorAll(QUESTION_SELECTOR).forEach(item => {
        item.querySelectorAll(OPTION_INPUT_SELECTOR).forEach(input => {
          const labelEl = input.closest('label') || input.parentElement;
          if (labelEl) {
            labelEl.style.color = '';
            labelEl.style.fontWeight = '';
          }
        });
      });
    }));

    document.body.appendChild(ctrl);
  }

  /***** 可选：支持从控制台注入答案（如果接口无法拦截时手动赋值） *****/
  // window.NCME_InjectAnswers([{ code:'28830252', title:'题干...', answer:['A','B'], optionalContent:[{mark:'A',chooseContent:'...'}] }])
  window.NCME_InjectAnswers = function (list) {
    if (!Array.isArray(list)) return;
    const map = {};
    list.forEach(q => {
      if (!q?.code) return;
      map[q.code] = {
        title: q.title || '',
        answer: Array.isArray(q.answer) ? q.answer : (q.answer != null ? [q.answer] : []),
        optionalContent: Array.isArray(q.optionalContent) ? q.optionalContent.map(o => ({
          mark: o.mark, chooseContent: o.chooseContent
        })) : undefined
      };
    });
    answersStore.merge(map);
    log('✅ 手动注入答案完成：', Object.keys(map).length);
    scheduleRender();
  };

  /***** 启动流程 *****/
  window.addEventListener('load', () => {
    mountControls();
    observeQuestions();
    // 初始渲染（等待页面完成一次 Vue/Nuxt 渲染）
    scheduleRender(1000);
  });
})();
