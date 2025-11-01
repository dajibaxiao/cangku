// ==UserScript==
// @name         CME 自动签到助手（带配置+提示）
// @namespace    https://raw.githubusercontent.com/dajibaxiao/cangku/refs/heads/main/cme-qiandao3.js
// @version      1.2
// @description  缩短签到时间并自动完成签到，不影响视频学习进度，带配置面板和提示回显
// @author       You
// @match        *://*.haoyisheng.com/*
// @match         *://bjsqypx.haoyisheng.com/cme/study2.jsp*
// @match         *://bjsqypx.haoyisheng.com/cme/exam.jsp*
// @match         *://cme.haoyisheng.com/cme/polyv.jsp*
// @match         *://cme.haoyisheng.com/cme/study2.jsp*
// @match         *://cme.haoyisheng.com/cme/exam.jsp*
// @match         *://cme.haoyisheng.com/cme/examQuizFail.jsp*
// @match         *://bjsqypx.haoyisheng.com/qypx/bj/polyv.jsp*
// @match         *://bjsqypx.haoyisheng.com/qypx/bj/cc.jsp*
// @match         *://bjsqypx.haoyisheng.com/qypx/bj/exam.jsp*
// @match         *://bjsqypx.haoyisheng.com/qypx/bj/examQuizFail.jsp*
// @match         *://*.cmechina.net/cme/polyv.jsp*
// @match         *://*.cmechina.net/cme/study2.jsp*
// @match         *://*.cmechina.net/cme/exam.jsp*
// @match         *://*.cmechina.net/cme/examQuizFail.jsp*
// @match         *://bjsqypx.haoyisheng.com/cme/*
// @match         *://cme.haoyisheng.com/cme/*
// @match         *://*.cmechina.net/cme/*
// @grant        none
// @downloadURL https://raw.githubusercontent.com/dajibaxiao/cangku/refs/heads/main/cme-qiandao3.js
// @updateURL https://raw.githubusercontent.com/dajibaxiao/cangku/refs/heads/main/cme-qiandao3.js
// ==/UserScript==

(function() {
    'use strict';

    // 默认配置
    let config = {
        pauseSecond: 30, // 默认 30 秒触发签到
        autoSign: true // 默认自动签到
    };

    // 从 localStorage 读取配置
    const saved = localStorage.getItem("cme_autosign_config");
    if (saved) {
        try { config = JSON.parse(saved); } catch(e){}
    }

    // 保存配置
    function saveConfig() {
        localStorage.setItem("cme_autosign_config", JSON.stringify(config));
    }

    // 显示提示条
    function showToast(msg, color="#4caf50") {
        const toast = document.createElement("div");
        toast.innerText = msg;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${color};
            color: #fff;
            padding: 10px 20px;
            border-radius: 5px;
            z-index: 999999;
            font-size: 14px;
        `;
        document.body.appendChild(toast);
        setTimeout(()=>toast.remove(), 3000);
    }

    // 创建配置面板
    function createPanel() {
        const panel = document.createElement("div");
        panel.id = "cmeConfigPanel";
        panel.style.cssText = `
            position: fixed;
            right: 20px;
            bottom: 20px;
            background: #fff;
            border: 1px solid #ccc;
            padding: 10px;
            font-size: 14px;
            z-index: 99999;
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        `;
        panel.innerHTML = `
            <div><b>自动签到助手</b></div>
            <div style="margin-top:5px;">
              触发时间(秒): <input type="number" id="pauseSecondInput" value="${config.pauseSecond}" style="width:60px;">
            </div>
            <div style="margin-top:5px;">
              自动签到: <input type="checkbox" id="autoSignInput" ${config.autoSign ? "checked" : ""}>
            </div>
            <button id="saveConfigBtn" style="margin-top:8px;">保存</button>
            <button id="testSignBtn" style="margin-top:8px;">立即触发签到</button>
        `;
        document.body.appendChild(panel);

        document.getElementById("saveConfigBtn").onclick = () => {
            config.pauseSecond = parseInt(document.getElementById("pauseSecondInput").value) || 30;
            config.autoSign = document.getElementById("autoSignInput").checked;
            saveConfig();
            showToast("配置已保存 ✅");
        };

        document.getElementById("testSignBtn").onclick = () => {
            autoSign();
        };
    }

    // 自动签到逻辑
    function autoSign() {
        try {
            // 隐藏弹窗
            document.querySelectorAll(".mark,.xywarp").forEach(el => {el.style.display="none"});
            // 调用原有签到完成逻辑
            if (typeof window.readComplete === "function") {
                window.readComplete();
                showToast("已自动签到 ✅");
            } else if (window.cc_js_Player && typeof window.cc_js_Player.play === "function") {
                window.cc_js_Player.play();
                showToast("已恢复播放 ✅");
            }
        } catch (e) {
            console.error("自动签到失败:", e);
            showToast("自动签到失败 ❌","#f44336");
        }
    }

    // 定时检测播放进度
    const interval = setInterval(() => {
        try {
            if (window.cc_js_Player && typeof window.cc_js_Player.getPosition === "function") {
                const pos = parseInt(window.cc_js_Player.getPosition());
                if (pos >= config.pauseSecond) {
                    clearInterval(interval);
                    console.log("⏱ 到达签到点:", pos, "秒");
                    if (config.autoSign) {
                        autoSign();
                    } else {
                        showToast("已到签到点，请手动签到 ⚠️","#ff9800");
                    }
                }
            }
        } catch(e){}
    }, 1000);

    // 页面加载后创建配置面板
    window.addEventListener("load", createPanel);

})();
