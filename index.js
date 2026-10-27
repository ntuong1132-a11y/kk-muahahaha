'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT      = Number(process.env.PORT) || 3000;
const TOOL_HTML = path.join(__dirname, 'tool.html');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log   = (...a) => console.log(`[${new Date().toLocaleTimeString('vi-VN',{hour12:false})}]`, ...a);

const S = { phien:null, duDoan:null, ketQua:null, doTinCay:null, updatedAt:0, ready:false, errors:0 };

function snapshot() {
    if (!S.ready || !S.phien) return { ok:false };
    return { ok:true, id:'Ng Van Tuong', phien:S.phien, duDoan:S.duDoan, ketQua:S.ketQua, doTinCay:S.doTinCay, updatedAt:S.updatedAt };
}

async function extractFromDOM(page) {
    return await page.evaluate(() => {
        const lines = (document.body.innerText||'').split('\n').map(l=>l.trim()).filter(Boolean);
        let phien=null,ketQua=null,duDoan=null,doTinCay=null;
        for (let i=0;i<lines.length;i++) {
            if (/^\d{7,9}$/.test(lines[i])) {
                phien = lines[i];
                const n1 = (lines[i+1]||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
                const n2 = (lines[i+2]||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
                if (['TAI','XIU','T','X'].includes(n1)) ketQua = lines[i+1];
                if (['TAI','XIU','T','X'].includes(n2)) duDoan = lines[i+2];
                if ((lines[i+3]||'').includes('%')) doTinCay = lines[i+3];
                break;
            }
        }
        return { phien, ketQua, duDoan, doTinCay };
    });
}

async function clickButton(page, keywords) {
    return await page.evaluate((kws) => {
        const els = Array.from(document.querySelectorAll('button,[role="button"],div,span,a,li'));
        for (const el of els) {
            const txt = (el.innerText||el.textContent||'').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
            for (const kw of kws) {
                if (txt === kw.toUpperCase()) { el.click(); return txt; }
            }
        }
        return null;
    }, keywords);
}

async function runLoop() {
    let browser, page;
    while (true) {
        try {
            log('🚀 Khởi động browser...');
            browser = await chromium.launch({
                headless: true,
                args: ['--no-sandbox','--disable-setuid-sandbox','--disable-blink-features=AutomationControlled'],
            });
            const ctx = await browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
                viewport: { width:1280, height:800 },
            });
            await ctx.addInitScript(() => {
                Object.defineProperty(navigator,'webdriver',{get:()=>false});
                Object.defineProperty(navigator,'plugins',{get:()=>[1,2,3,4,5]});
                window.chrome = { runtime:{} };
            });
            page = await ctx.newPage();
            await page.goto('file://'+TOOL_HTML, { waitUntil:'domcontentloaded', timeout:30000 });
            log('📄 Tool loaded, đợi 6s...');
            await sleep(6000);

            const md5 = await clickButton(page, ['MD5','MD5 SERVER']);
            log(`🖱️ Click MD5: "${md5||'không thấy'}"`);
            await sleep(4000);

            let lastPhien=null, lastKetQua=null;
            while (true) {
                await sleep(10000);
                const d = await extractFromDOM(page);
                if (!d.phien) continue;

                if (d.phien !== lastPhien) {
                    lastPhien = d.phien;
                    S.phien=d.phien; S.duDoan=d.duDoan; S.ketQua=d.ketQua; S.doTinCay=d.doTinCay;
                    S.updatedAt=Date.now(); S.ready=true; S.errors=0;
                    log(`🔮 #${d.phien} | dự đoán: ${d.duDoan} | kq: ${d.ketQua} | ${d.doTinCay}`);
                }

                if (d.ketQua && d.ketQua !== lastKetQua && lastKetQua !== null) {
                    lastKetQua = d.ketQua;
                    log(`✅ Kết quả: ${d.ketQua} → Reset...`);
                    await sleep(1500);
                    const r = await clickButton(page, ['RESET','LAM MOI','NEW']);
                    log(`🔄 Reset: "${r||'không thấy'}"`);
                    await sleep(3000);
                } else if (!lastKetQua && d.ketQua) {
                    lastKetQua = d.ketQua;
                }
            }
        } catch(e) {
            S.errors++;
            log(`❌ ${e.message} (lần ${S.errors})`);
            try { if(browser) await browser.close(); } catch(_) {}
            await sleep(15000);
        }
    }
}

const server = http.createServer((req,res) => {
    const url = (req.url||'/').split('?')[0];
    const cors = {'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'};
    if (url === '/api/predict') {
        res.writeHead(200,{...cors,'Content-Type':'application/json;charset=utf-8'});
        return res.end(JSON.stringify(snapshot()));
    }
    if (url === '/api/health') {
        res.writeHead(200,{...cors,'Content-Type':'application/json;charset=utf-8'});
        return res.end(JSON.stringify({up:true,ready:S.ready,errors:S.errors,phien:S.phien}));
    }
    res.writeHead(404,cors); res.end('Not found');
});

server.listen(PORT,'0.0.0.0',()=>log(`🚀 Server :${PORT}`));
process.on('uncaughtException', e=>console.error('[uncaught]',e&&e.message));
process.on('unhandledRejection', e=>console.error('[unhandled]',e&&e.message));
runLoop();
