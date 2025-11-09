// ==UserScript==
// @name         NCME 助手（视频心跳完成 + 防切屏检测）
// @namespace    https://ncme.org.cn/
// @version      1.0.0
// @description  拦截并伪造视频心跳为完成，自动复用Authorization；同时屏蔽失焦/鼠标移出/可见性检测，带UI提示与手动完成按钮
// @match        *://*.ncme.org.cn/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  /************** 防切屏检测（失焦/可见性/鼠标移出） **************/
  const blockEvents = ["blur", "focus", "visibilitychange", "mouseout", "mouseleave"];
  const shield = () => {
    // 拦截捕获阶段事件，阻止后续侦听器执行
    blockEvents.forEach(evt => {
      window.addEventListener(evt, e => e.stopImmediatePropagation(), true);
      document.addEventListener(evt, e => e.stopImmediatePropagation(), true);
    });
    // 清空常用的直接绑定
    window.onblur = null;
    window.onfocus = null;
    document.onvisibilitychange = null;
    window.onmouseout = null;
    document.onmouseleave = null;
    showToast("✅ 防切屏检测已启用");
    console.log("✅ 防切屏检测已启用");
  };

  /************** UI：轻量提示与按钮 **************/
  function showToast(msg, ms = 3000) {
    let el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText = `
      position:fixed;top:20px;right:20px;z-index:999999;
      background:rgba(0,0,0,.75);color:#fff;padding:8px 12px;border-radius:6px;
      font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,.2)
    `;
    document.documentElement.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  function ensureButton(id, text, onclick) {
    if (document.getElementById(id)) return;
    const btn = document.createElement("button");
    btn.id = id;
    btn.textContent = text;
    btn.style.cssText = `
      position:fixed;top:64px;right:20px;z-index:999999;
      background:#28a745;color:#fff;border:0;border-radius:6px;
      padding:8px 12px;cursor:pointer;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,.2)
    `;
    btn.onclick = onclick;
    document.documentElement.appendChild(btn);
  }

  /************** 心跳拦截与伪造 **************/
  let authToken = null;

  // 抓取 Authorization 头
  const origSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (header, value) {
    try {
      if (header && header.toLowerCase() === "authorization") {
        authToken = value;
        console.log("🔑 捕获到 token:", authToken);
      }
    } catch (e) {}
    return origSetRequestHeader.call(this, header, value);
  };

  // 记录 open 信息
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._url = url;
    this._method = method;
    return origOpen.call(this, method, url, ...rest);
  };

  // 拦截 send，伪造 uploadStudyRecord 心跳
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
    try {
      if (this._url && this._url.includes("/resourceApi/web/learning/uploadStudyRecord")) {
        let dataStr = body;
        // NCME心跳通常是JSON串
        try {
          const obj = JSON.parse(dataStr);
          const duration = pickDuration(obj);

          // 伪造为完成
          obj.currentPosition = duration;
          obj.totalSecond = duration;
          obj.allTime = duration;
          obj.completeDuration = duration;
          obj.watchTrackList = [{ startSecond: 0, endSecond: duration }];

          const forged = JSON.stringify(obj);
          console.log("📡 伪造心跳包:", forged);
          showToast("🎬 心跳包已伪造为完成", 2500);
          return origSend.call(this, forged);
        } catch (e) {
          // 如果不是JSON，直接透传
          console.warn("⚠️ 心跳包解析失败，透传原始body", e);
        }
      }
    } catch (e) {}
    return origSend.call(this, body);
  };

  // 从心跳对象中提取时长（优先已有字段，其次兜底）
  function pickDuration(obj) {
    // 常见字段：totalSecond / allTime / completeDuration / duration
    const candidates = [
      obj?.totalSecond, obj?.allTime, obj?.completeDuration, obj?.duration,
    ].filter(v => typeof v === "number" && v > 0);
    if (candidates.length) return Math.max(...candidates);

    // 兜底：如平台未给时长，用较保守默认
    return 1800; // 30分钟兜底，可按课程实际调整
  }

  // 主动发送“完成”记录（带token）
  async function sendCompleteRecord() {
    if (!authToken) {
      showToast("⚠️ 尚未捕获到token，等待页面心跳触发");
      return;
    }
    // 需要从页面上下文提取这四个ID；若页面心跳里已有，将由拦截自动伪造，无需主动发
    const context = collectContextFromPage();
    if (!context) {
      showToast("⚠️ 未获取到课程上下文参数");
      return;
    }
    const { unitId, periodId, materialId, courseId, duration } = context;

    try {
      const res = await fetch("https://www.ncme.org.cn/resourceApi/web/learning/uploadStudyRecord", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authToken
        },
        body: JSON.stringify({
          unitId,
          periodId,
          sourceType: 2,
          type: 1,
          materialId,
          courseId,
          currentPosition: duration,
          totalSecond: duration,
          allTime: duration,
          completeDuration: duration,
          watchTrackList: [{ startSecond: 0, endSecond: duration }]
        })
      });
      const json = await res.json();
      console.log("📡 主动发送完整学习记录响应:", json);
      showToast("✅ 已主动发送完整学习记录");
    } catch (e) {
      console.warn("❌ 主动发送失败:", e);
      showToast("❌ 主动发送失败，查看控制台");
    }
  }

  // 从页面脚本或DOM中提取课程参数（尽量弱入侵，避免破坏现有逻辑）
  function collectContextFromPage() {
    // 可在此根据你页面的真实变量进行提取：
    // 例如 window.playerContext / 页面内联脚本 / 心跳体缓存等
    // 这里先尝试从最近一次被拦截的心跳体推断（需你按实际补充缓存）
    try {
      // 如果你在 send 拦截里缓存了最近心跳体，可以从 window.__LAST_BEAT__ 取值
      const beat = window.__LAST_BEAT__;
      if (beat && typeof beat === "object") {
        const duration = pickDuration(beat);
        return {
          unitId: beat.unitId,
          periodId: beat.periodId,
          materialId: beat.materialId,
          courseId: beat.courseId,
          duration
        };
      }
    } catch (e) {}
    return null;
  }

  /************** 初始化：在文档交互后挂载 UI 与屏蔽 **************/
  // 提前屏蔽事件
  shield();

  // 页面就绪后挂按钮
  const ready = () => {
    ensureButton("ncme-complete-video-btn", "立即完成视频", sendCompleteRecord);
  };

  // 文档加载阶段处理
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ready, { once: true });
  } else {
    ready();
  }

  // 可选：在心跳拦截处缓存最近心跳体用于主动发送（若你需要）
  const _origSend2 = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
    try {
      if (this._url && this._url.includes("/resourceApi/web/learning/uploadStudyRecord")) {
        try {
          window.__LAST_BEAT__ = JSON.parse(body);
        } catch (e) {}
      }
    } catch (e) {}
    return _origSend2.call(this, body);
  };
})();
