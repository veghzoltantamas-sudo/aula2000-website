const express = require("express");
const path = require("path");
const fsSync = require("fs");
const multer = require("multer");
const bcrypt = require("bcryptjs");

function formatClientBody(raw){
    let s = String(raw||'').trim();
    if(!s) return '';
    s = s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const lines = s.split(/\r?\n/);
    const out=[];
    let listType=null;
    const closeList=()=>{ if(listType){ out.push('</'+listType+'>'); listType=null; } };
    const inline=(t)=> t
        .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g,'<em>$1</em>')
        .replace(/`([^`]+)`/g,'<code>$1</code>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
    for(const rawLine of lines){
        const trimmed = rawLine.trimEnd();
        if(!trimmed.trim() && !listType){ out.push('<p></p>'); continue; }
        if(!trimmed.trim()){ closeList(); continue; }
        const ulM = trimmed.match(/^\s*[-\xE2\x80\xA2]\s+(.+)/);
        const olM = trimmed.match(/^\s*\d+[.)]\s+(.+)/);
        const hM = trimmed.match(/^(#{2,3})\s+(.+)/);
        if(hM){ closeList(); const lvl=hM[1].length===2?'h3':'h4'; out.push('<'+lvl+'>'+inline(hM[2])+'</'+lvl+'>'); }
        else if(ulM){ if(listType!=='ul'){ closeList(); listType='ul'; out.push('<ul>'); } out.push('<li>'+inline(ulM[1])+'</li>'); }
        else if(olM){ if(listType!=='ol'){ closeList(); listType='ol'; out.push('<ol>'); } out.push('<li>'+inline(olM[1])+'</li>'); }
        else { closeList(); out.push('<p>'+inline(trimmed.trim())+'</p>'); }
    }
    closeList();
    return out.filter(x=>x!=='<p></p>').join('\n');
}

function createClientRouter(deps){
    const router = express.Router();
    const { dbGet, dbAll, dbRun, getSettingsMap, generateCsrfToken, validateCsrfToken } = deps;
    const CLIENT_DIR = path.join(__dirname, '..', 'data', 'client_files');
    async function isEnabled(){
        try{ const m=await getSettingsMap(); return String(m.ugyfelkapu_enabled)==='1'; }catch{ return false; }
    }
    async function requireEnabled(req,res,next){
        if(!(await isEnabled())) return res.status(404).render("error",{ code:404, message:"Az Ugyfelkapu jelenleg nem elerheto.", backUrl:"/" });
        next();
    }
    function requireClientLogin(req,res,next){
        if(!req.session.clientLoggedIn || !req.session.clientUserId) return res.redirect("/ugyfel/login");
        next();
    }
    const ALLOWED = new Set(['image/jpeg','image/png','image/webp','image/gif','image/avif','image/svg+xml','application/pdf','application/zip','application/x-zip-compressed','application/x-dwg','image/vnd.dwg','application/acad','application/dwg','application/octet-stream','text/plain','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
    const clientUpload = multer({
        storage: multer.memoryStorage(),
        limits:{ fileSize: 25*1024*1024, files: 10 },
        fileFilter:(req,file,cb)=>{
            const mt=String(file.mimetype||'').toLowerCase();
            if(ALLOWED.has(mt)) return cb(null,true);
            const ext=path.extname(file.originalname||'').toLowerCase();
            if(['.zip','.rar','.dwg','.dxf','.pdf','.jpg','.jpeg','.png','.webp','.gif','.avif','.svg','.doc','.docx','.xls','.xlsx','.txt'].includes(ext)) return cb(null,true);
            return cb(new Error('Nem tamogatott fajltipus: '+file.mimetype));
        }
    });
    router.get("/login", requireEnabled, async (req,res)=>{
        if(req.session.clientLoggedIn) return res.redirect("/ugyfel/projekt");
        const settings=await getSettingsMap().catch(()=>({}));
        let content={}; try{ const rows=await dbAll("SELECT section, body FROM content"); content=Object.fromEntries((rows||[]).map(r=>[r.section,r.body])); }catch{}
        res.render("client-login",{ error:null, settings, content, csrfToken: generateCsrfToken(req.session.id, req.session) });
    });
    router.post("/login", requireEnabled, async (req,res,next)=>{
        try{
            const raw=(req.body && req.body._csrf)|| req.get('x-csrf-token')||'';
            const token=Array.isArray(raw)?raw[0]:String(raw).trim();
            if(!validateCsrfToken(req.session.id, token, req.session)){
                const settings=await getSettingsMap().catch(()=>({}));
                return res.status(403).render("client-login",{ error:"Ervenytelen token. Frissitse az oldalt.", settings, content:{}, csrfToken: generateCsrfToken(req.session.id, req.session) });
            }
            const username=String(req.body.username||'').trim();
            const password=String(req.body.password||'');
            const user=await dbGet("SELECT * FROM client_users WHERE username=?",[username]);
            if(!user || Number(user.is_active)!==1 || !bcrypt.compareSync(password, user.password_hash)){
                const settings=await getSettingsMap().catch(()=>({}));
                return res.status(401).render("client-login",{ error:"Hibas felhasznalonev vagy jelszo.", settings, content:{}, csrfToken: generateCsrfToken(req.session.id, req.session) });
            }
            req.session.regenerate((err)=>{
                if(err) return next(err);
                req.session.clientLoggedIn=true; req.session.clientUserId=user.id; req.session.clientUsername=user.username;
                req.session.save((e)=>{ if(e) return next(e); res.redirect("/ugyfel/projekt"); });
            });
        }catch(err){ next(err); }
    });
    router.get("/logout", async(req,res)=>{ if(req.session){ delete req.session.clientLoggedIn; delete req.session.clientUserId; delete req.session.clientUsername; } res.redirect("/ugyfel/login"); });
    router.post("/logout", async(req,res)=>{ if(req.session){ delete req.session.clientLoggedIn; delete req.session.clientUserId; delete req.session.clientUsername; } res.redirect("/ugyfel/login"); });
    router.get("/projekt", requireEnabled, requireClientLogin, async(req,res,next)=>{
        try{
            const user=await dbGet("SELECT id, username, display_name, email, project_name, project_phase FROM client_users WHERE id=?", [req.session.clientUserId]);
            if(!user){ delete req.session.clientLoggedIn; return res.redirect("/ugyfel/login"); }
            const updates=await dbAll("SELECT * FROM client_project_updates WHERE client_user_id=? ORDER BY datetime(created_at) DESC, id DESC",[user.id]);
            const allFiles=await dbAll("SELECT * FROM client_files WHERE client_user_id=? ORDER BY id DESC",[user.id]);
            const filesByUpdate={}; const orphanFiles=[];
            for(const f of (allFiles||[])){ if(f.update_id){ (filesByUpdate[f.update_id]=filesByUpdate[f.update_id]||[]).push(f); } else orphanFiles.push(f); }
            const settings=await getSettingsMap().catch(()=>({}));
            let content={}; try{ const rows=await dbAll("SELECT section, body FROM content"); content=Object.fromEntries((rows||[]).map(r=>[r.section,r.body])); }catch{}
            const safeUpdates=(updates||[]).map(u=>({ ...u, body_html: u.body_html && String(u.body_html).trim() ? u.body_html : formatClientBody(u.body_raw||''), files: filesByUpdate[u.id]||[] }));
            res.render("client-project", { user, updates: safeUpdates, orphanFiles, settings, content, project_phase: user.project_phase || 0 });
        }catch(err){ next(err); }
    });
    router.get("/fajl/:id", requireEnabled, requireClientLogin, async(req,res,next)=>{
        try{
            const file=await dbGet("SELECT * FROM client_files WHERE id=?",[req.params.id]);
            if(!file) return res.status(404).render("error",{ code:404, message:"A fajl nem talalhato.", backUrl:"/ugyfel/projekt" });
            if(Number(file.client_user_id)!==Number(req.session.clientUserId)) return res.status(403).render("error",{ code:403, message:"Nincs jogosultsaga ehhez a fajlhoz.", backUrl:"/ugyfel/projekt" });
            const fp=path.join(CLIENT_DIR, file.stored_name);
            if(!fsSync.existsSync(fp)) return res.status(404).render("error",{ code:404, message:"A fajl nem talalhato a szerveren.", backUrl:"/ugyfel/projekt" });
            const dl=req.query.dl==='1';
            res.setHeader('Content-Type', (file.mime_type && file.mime_type !== 'application/octet-stream') ? file.mime_type : (path.extname(file.original_name).toLowerCase() === '.pdf' ? 'application/pdf' : (file.mime_type || 'application/octet-stream')));
            const isImage=String(file.mime_type||'').startsWith('image/');
            const isPdf=String(file.mime_type||'')==='application/pdf';
            // PDF esetén mindig kényszerítjük a letöltést/megnyitást mellékletként
            if (isPdf) {
                // Biztosítjuk, hogy a Content-Type application/pdf legyen
                res.setHeader('Content-Type', 'application/pdf');
                res.removeHeader('Content-Security-Policy');
                res.removeHeader('X-Frame-Options');
                res.removeHeader('X-Content-Type-Options');
                res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate'); // Ne cache-elje a fejléceket
                res.setHeader('X-Accel-Buffering', 'no'); // Proxy-nak szóló utasítás
                res.setHeader('Content-Disposition', `attachment; filename="${String(file.original_name).replace(/"/g,'')}"`);
                return res.sendFile(fp);
            }

            // Egyéb fájltípusok (kép, videó stb.)
            // Ha a ?dl=1 paramétert küldték, vagy nem inline megjeleníthető típus
            if(dl || (!isImage && !isVideo && !isText && !isOffice)) {
                res.setHeader('Content-Disposition',`attachment; filename="${String(file.original_name).replace(/"/g,'')}"`);
            } else { // Alapértelmezésben inline megjelenítés
                res.setHeader('Content-Disposition',`inline; filename="${String(file.original_name).replace(/"/g,'')}"`);
            }
            return res.sendFile(fp);
        }catch(err){ next(err); }
    });
    // Galéria oldal
    router.get("/galeria", requireEnabled, requireClientLogin, async(req,res,next)=>{
        try{
            const user=await dbGet("SELECT id, username, display_name, email, project_name FROM client_users WHERE id=?",[req.session.clientUserId]);
            if(!user){ delete req.session.clientLoggedIn; return res.redirect("/ugyfel/login"); }
            const images=await dbAll("SELECT f.*, u.title as update_title FROM client_files f LEFT JOIN client_project_updates u ON f.update_id=u.id WHERE f.client_user_id=? AND f.mime_type LIKE 'image/%' ORDER BY f.id DESC",[user.id]);
            const settings=await getSettingsMap().catch(()=>({}));
            res.render("client-gallery",{ user, images: images||[], settings });
        }catch(err){ next(err); }
    });
    // Thumbnail kiszolgálás
    router.get("/fajl/:id/thumb", requireEnabled, requireClientLogin, async(req,res,next)=>{
        try{
            const file=await dbGet("SELECT * FROM client_files WHERE id=?",[req.params.id]);
            if(!file || !file.thumb_name) return res.status(404).end();
            if(Number(file.client_user_id)!==Number(req.session.clientUserId)) return res.status(403).end();
            const fp=path.join(CLIENT_DIR, file.thumb_name);
            if(!fsSync.existsSync(fp)) return res.status(404).end();
            res.setHeader('Content-Type','image/webp');
            res.setHeader('Cache-Control','public, max-age=86400');
            return res.sendFile(fp);
        }catch(err){ next(err); }
    });
    // Fájl megtekintés (inline)
    router.get("/fajl/:id/view", requireEnabled, requireClientLogin, async(req,res,next)=>{
        try{
            const file=await dbGet("SELECT * FROM client_files WHERE id=?",[req.params.id]);
            if(!file) return res.status(404).render("error",{ code:404, message:"A fájl nem található.", backUrl:"/ugyfel/projekt" });
            if(Number(file.client_user_id)!==Number(req.session.clientUserId)) return res.status(403).render("error",{ code:403, message:"Nincs jogosultsága ehhez a fájlhoz.", backUrl:"/ugyfel/projekt" });
            const fp=path.join(CLIENT_DIR, file.stored_name);
            if(!fsSync.existsSync(fp)) return res.status(404).render("error",{ code:404, message:"A fájl nem található a szerveren.", backUrl:"/ugyfel/projekt" });
            const isImage=String(file.mime_type||'').startsWith('image/');
            const isPdf=String(file.mime_type||'')==='application/pdf';
            const isVideo=String(file.mime_type||'').startsWith('video/');
            const isAudio=String(file.mime_type||'').startsWith('audio/');
            const isText=String(file.mime_type||'').startsWith('text/');
            const isOffice=String(file.mime_type||'').includes('officedocument') || String(file.mime_type||'').includes('msword') || String(file.mime_type||'').includes('ms-excel');
            res.render("client-viewer",{ user: null, file, isImage, isPdf, isVideo, isAudio, isText, isOffice, fileUrl: "/ugyfel/fajl/"+file.id });
        }catch(err){ next(err); }
    });
    return { router, isEnabled, requireEnabled, requireClientLogin, clientUpload, CLIENT_DIR, formatClientBody };
}
module.exports={ createClientRouter, formatClientBody };
