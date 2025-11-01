// ==UserScript==
// @name          好医生-视频一键到底与自动答题（琅少修正版）
// @namespace     https://raw.githubusercontent.com/dajibaxiao/cangku/refs/heads/main/cme-haoyisheng-helper.js
// @version       1.7.4
// @description   CME平台视频倍速、一键看完、考试一键完成。考试页按钮固定右上角，强制新窗口遍历答案直到正确。
// @author        limkim & langshao
// @license MIT
// @require       https://unpkg.com/sweetalert2@11/dist/sweetalert2.min.js
// @resource Swal https://unpkg.com/sweetalert2@11/dist/sweetalert2.min.css
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
// @icon          https://raw.githubusercontent.com/lim-kim930/cme-haoyisheng-helper/main/favicon.ico
// @run-at        document-end
// @grant         unsafeWindow
// @grant         GM_addStyle
// @grant         GM_getValue
// @grant         GM_setValue
// @grant         GM_deleteValue
// @grant         GM_listValues
// @grant         GM_openInTab
// @grant         GM_notification
// @grant         GM_xmlhttpRequest
// @grant         GM_getResourceText
// @require       https://unpkg.com/sweetalert2@11/dist/sweetalert2.min.js
// @resource      Swal https://unpkg.com/sweetalert2@11/dist/sweetalert2.min.css
// @match         *://bjsqypx.haoyisheng.com/cme/*
// @match         *://cme.haoyisheng.com/cme/*
// @match         *://*.cmechina.net/cme/*
// @icon          https://raw.githubusercontent.com/lim-kim930/cme-haoyisheng-helper/main/favicon.ico
// @run-at        document-end
// @grant         unsafeWindow
// @grant         GM_getResourceText
// @downloadURL https://raw.githubusercontent.com/dajibaxiao/cangku/refs/heads/main/cme-haoyisheng-helper.js
// @updateURL https://raw.githubusercontent.com/dajibaxiao/cangku/refs/heads/main/cme-haoyisheng-helper.js
// ==/UserScript==

(function () {
    'use strict';

    const buttonCssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999;
        padding: 10px;
        cursor: pointer;
        background: #3087d9;
        color: #fff;
        border-radius: 10px;
        box-shadow: 0px 0px 12px rgba(0,0,0,.12);
    `;

    function getUrlParams(name) {
        const urlSearchParams = new URLSearchParams(window.location.search);
        return urlSearchParams.get(name);
    }
    function getLastUrlPath() {
        const pathList = window.location.pathname.split('/');
        return pathList[pathList.length - 1];
    }
    const lastPath = getLastUrlPath();

    function getNextChoice(str) {
        const code = str.charCodeAt(0) + 1;
        if (code > 69) return 'A';
        return String.fromCharCode(code);
    }
    function getNextMultipleChoice(str) {
        const dic = ['ABCDE','BCDE','ACDE','ABDE','ABCE','ABCD','CDE','BDE','BCE','BCD','ADE','ACE','ACD','ABE','ABD','ABC','DE','CE','CD','BE','BD','BC','AE','AD','AC','AB','E','D','C','B','A'];
        const index = dic.indexOf(str);
        if (index === dic.length - 1) return dic[0];
        return dic[index + 1];
    }

    // ===== 失败页逻辑 =====
    if (lastPath === 'examQuizFail.jsp') {
        const nowAnswerStr = window.location.search.split('ansList=')[1]?.split('&')[0];
        if (!nowAnswerStr) return;
        const nowAnswerList = nowAnswerStr.split(',');
        const answersList = document.querySelectorAll('.answer_list h3');
        let finished = true;
        for (let i = 0; i < answersList.length; i++) {
            if (answersList[i].className.includes('cuo')) {
                finished = false;
                if (nowAnswerList[i].length === 1) {
                    nowAnswerList[i] = getNextChoice(nowAnswerList[i]);
                } else {
                    nowAnswerList[i] = getNextMultipleChoice(nowAnswerList[i]);
                }
                window.location.href = window.location.href.replace(nowAnswerStr, nowAnswerList.join(','));
                break;
            }
        }
        if (finished) {
            window.close();
        }
        return;
    }

    // ===== 考试页逻辑 =====
    if (lastPath === 'exam.jsp') {
        const questionsList = document.querySelectorAll('.exam_list li');

        const autoSelectAnswer = answerArray => {
            const indexMap = { 'A':0,'B':1,'C':2,'D':3,'E':4 };
            for (let i = 0; i < questionsList.length; i++) {
                const answer = answerArray[i];
                const optionsList = questionsList[i].querySelectorAll('p');
                if (questionsList[i].querySelectorAll('input[type="radio"]').length > 0) {
                    const index = indexMap[answer] ?? 0;
                    const input = optionsList[index]?.children[0];
                    if (input) input.checked = true;
                } else {
                    for (let j=0;j<optionsList.length;j++) {
                        const input = optionsList[j]?.children[0];
                        if (input && answer.includes(input.value)) {
                            input.checked = true;
                        }
                    }
                }
            }
        };

        const examSkipButton = document.createElement('button');
        examSkipButton.innerText = '自动遍历答题';
        examSkipButton.id = 'exam_skip_btn';
        examSkipButton.style.cssText = buttonCssText;

        examSkipButton.addEventListener('click', () => {
            const answersArray = Array.from(questionsList).map(q => {
                const isSingle = q.querySelectorAll('input[type="radio"]').length > 0;
                return isSingle ? 'A' : 'ABCDE';
            });
            autoSelectAnswer(answersArray);

            const form = document.forms['form1'];
            if (form) {
                form.setAttribute('target','_blank');
                if (typeof unsafeWindow.doSubmit === 'function') {
                    unsafeWindow.doSubmit();
                } else {
                    form.submit();
                }
            }
        });

        // 直接挂到 body，保证显示
        document.body.appendChild(examSkipButton);
    }

    // ===== 视频跳过逻辑 =====
    setTimeout(() => {
        let player = null;
        if (unsafeWindow.player && unsafeWindow.player.params) {
            unsafeWindow.player.params.rate_allow_change = true;
            player = unsafeWindow.player;
        } else if (unsafeWindow.cc_js_Player && unsafeWindow.cc_js_Player.params) {
            unsafeWindow.cc_js_Player.params.rate_allow_change = true;
            player = unsafeWindow.cc_js_Player;
        }

        const video = document.querySelector('.pv-video') || document.querySelector('video');
        if (!video) return;
        const parent = video.parentElement;

        const videoSkipButton = document.createElement('button');
        videoSkipButton.innerText = '看视频? 拿来吧你!';
        videoSkipButton.style.cssText = buttonCssText;

        videoSkipButton.addEventListener('click', () => {
            let videoDuration = video.duration;
            if (player) {
                videoDuration = player.getDuration() - 0.5;
                player.setVolume(0);
                player.play();
                player.jumpToTime(videoDuration);
            } else {
                video.volume = 0;
                video.currentTime = video.duration;
            }
        });

        parent.appendChild(videoSkipButton);
    }, 1500);

})();
