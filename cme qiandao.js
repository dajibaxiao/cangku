// ==UserScript==
// @name         CME 自动签到助手（可配置）
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  缩短签到时间并自动完成签到，不影响视频学习进度，带页面配置面板
// @author       You
// @match        *://*.haoyisheng.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 默认配置
    let config = {
        pauseSecond: 30,   // 默认 30 秒触发签到
        autoSign: true     // 默认自动签到
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
        `;
        document.body.appendChild(panel);

        document.getElementById("saveConfigBtn").onclick = () => {
            config.pauseSecond = parseInt(document.getElementById("pauseSecondInput").value) || 30;
            config.autoSign = document.getElementById("autoSignInput").checked;
            saveConfig();
            alert("配置已保存，刷新页面后生效");
        };
    }

    // 自动签到逻辑
    function autoSign() {
        try {
            // 隐藏弹窗
            document.querySelectorAll(".mark,.xywarp").forEach(el => el.style.display="none");
            // 调用原有签到完成逻辑
            if (typeof window.readComplete === "function") {
                window.readComplete();
                console.log("✅ 已自动调用 readComplete()");
            } else if (window.cc_js_Player && typeof window.cc_js_Player.play === "function") {
                window.cc_js_Player.play();
                console.log("✅ 直接恢复播放");
            }
        } catch (e) {
            console.error("自动签到失败:", e);
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
                        console.log("⚠️ 已到签到点，请手动点击签到");
                    }
                }
            }
        } catch(e){}
    }, 1000);

    // 页面加载后创建配置面板
    window.addEventListener("load", createPanel);

})();
