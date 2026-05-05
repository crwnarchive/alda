import { useState, useCallback, useEffect, useRef } from "react";

const API_KEY = import.meta.env.VITE_API_KEY;
const BASE_URL = "https://api.odcloud.kr/api/gov24/v3";
const MEDIAN_INCOME = { 1:239, 2:393, 3:505, 4:613, 5:718, 6:819 };

function getIncomeOptions(n) {
  const base = MEDIAN_INCOME[n] || MEDIAN_INCOME[4];
  return [
    { value:"30",  label:`월 ${Math.round(base*0.3)}만원 이하`,  sub:"기초생활수급자 수준" },
    { value:"50",  label:`월 ${Math.round(base*0.5)}만원 이하`,  sub:"차상위계층 수준" },
    { value:"75",  label:`월 ${Math.round(base*0.75)}만원 이하`, sub:"중위소득 75%" },
    { value:"100", label:`월 ${Math.round(base*1.0)}만원 이하`,  sub:"중위소득 1h00% · 중간 소득" },
    { value:"150", label:`월 ${Math.round(base*1.5)}만원 이하`,  sub:"중위소득 150%" },
    { value:"200+",label:`월 ${Math.round(base*1.5)}만원 초과`,  sub:"중위소득 150% 초과" },
  ];
}

function parseAmount(service) {
  const text = (service["지원내용"]||"")+(service["서비스목적요약"]||"");
  const m = text.match(/월\s*(\d+[,]?\d*)\s*만원/);
  const o = text.match(/(\d+[,]?\d*)\s*만원/);
  if (m) return { type:"월", amount:parseInt(m[1].replace(",","")) };
  if (o) return { type:"일시", amount:parseInt(o[1].replace(",","")) };
  return null;
}

const DEADLINE_MAP = [
  { keys:["첫만남","출생"], label:"출생 후 60일 이내" },
  { keys:["영아수당","아동수당"], label:"출생 후 매월" },
  { keys:["고위험 임산부"], label:"임신 중 신청" },
  { keys:["임산부 외래"], label:"임신 중 신청" },
  { keys:["출산휴가","출산전후"], label:"출산 전후 신청" },
  { keys:["육아휴직"], label:"복직 전까지" },
  { keys:["난임"], label:"치료 전 신청" },
];
function getDeadline(s) {
  const name = s["서비스명"]||"";
  for (const d of DEADLINE_MAP) { if (d.keys.some(k=>name.includes(k))) return d; }
  return null;
}

function calcFit(service, profile) {
  const cat = service["서비스분야"]||"";
  const txt = ((service["지원대상"]||"")+(service["선정기준"]||"")).toLowerCase();
  let score=0; let warnings=[];
  if (profile.pregnant && cat==="임신·출산") score+=40;
  const inc=parseInt(profile.income)||200;
  if (txt.includes("기초생활")&&inc<=30) score+=30;
  else if (txt.includes("차상위")&&inc<=50) score+=25;
  else if (txt.includes("중위소득 75")&&inc<=75) score+=20;
  else if (txt.includes("중위소득 100")&&inc<=100) score+=15;
  else if (!txt.includes("중위소득")&&!txt.includes("소득기준")) score+=10;
  else if (txt.includes("중위소득")&&inc>100) warnings.push("소득 초과 가능");
  if (!profile.house&&txt.includes("무주택")) score+=20;
  if (score===0) score=5;
  if (warnings.length>0&&score<20) return {badge:"확인 필요",color:"#FF9800"};
  if (score>=35) return {badge:"신청 가능",color:"#00C471"};
  if (score>=15) return {badge:"검토 추천",color:"#3182F6"};
  return {badge:"참고",color:"#ADB5BD"};
}

function getAgeRange(v) {
  return ({"0-2":[0,2],"3-6":[3,6],"7-12":[7,12],"13-18":[13,18],"19-24":[19,24],"25-34":[25,34],"35-44":[35,44],"45-54":[45,54],"55-64":[55,64],"65-74":[65,74],"75+":[75,120]})[v]||[0,120];
}

const CATS = {
  "전체":        {icon:"✦", color:"#1A1A2E"},
  "임신·출산":   {icon:"🤱", color:"#F06595"},
  "보육·교육":   {icon:"📚", color:"#845EF7"},
  "주거·자립":   {icon:"🏠", color:"#339AF0"},
  "고용·창업":   {icon:"💼", color:"#FD7E14"},
  "보건·의료":   {icon:"🏥", color:"#FF6B6B"},
  "생활안정":    {icon:"💚", color:"#51CF66"},
  "보호·돌봄":   {icon:"🤝", color:"#22B8CF"},
  "문화·환경":   {icon:"🎭", color:"#FF6348"},
  "행정·안전":   {icon:"🔒", color:"#868E96"},
};
function getCat(cat) {
  for (const k of Object.keys(CATS)) { if (cat&&cat.includes(k)&&k!=="전체") return CATS[k]; }
  return {icon:"📋",color:"#ADB5BD"};
}

const STEPS = [
  { id:"age", q:"만 나이가 어떻게 되세요?", opts:[
    "0-2","3-6","7-12","13-18","19-24","25-34","35-44","45-54","55-64","65-74","75+"
  ].map(v=>({value:v,label:v==="75+"?"만 75세 이상":`만 ${v.replace("-","~")}세`}))},
  { id:"region", q:"현재 거주하시는 지역은?", opts:[
    {v:"서울특별시",l:"서울"},{v:"부산광역시",l:"부산"},{v:"대구광역시",l:"대구"},
    {v:"인천광역시",l:"인천"},{v:"광주광역시",l:"광주"},{v:"대전광역시",l:"대전"},
    {v:"울산광역시",l:"울산"},{v:"세종특별자치시",l:"세종"},{v:"경기도",l:"경기"},
    {v:"강원특별자치도",l:"강원"},{v:"충청북도",l:"충북"},{v:"충청남도",l:"충남"},
    {v:"전북특별자치도",l:"전북"},{v:"전라남도",l:"전남"},{v:"경상북도",l:"경북"},
    {v:"경상남도",l:"경남"},{v:"제주특별자치도",l:"제주"},
  ].map(x=>({value:x.v,label:x.l}))},
  { id:"householdSize", q:"가구원 수가 어떻게 되세요?",
    opts:[1,2,3,4,5,6].map(n=>({value:n,label:`${n}인 가구`}))},
  { id:"married", q:"결혼 여부를 알려주세요",
    opts:[{value:true,label:"기혼 / 사실혼"},{value:false,label:"미혼"}]},
  { id:"pregnant", q:"임신 중이거나 출산 후 1년 이내인가요?",
    opts:[{value:true,label:"해당돼요 🤱"},{value:false,label:"해당 없어요"}]},
  { id:"house", q:"내 집이 있나요?",
    opts:[{value:true,label:"자가 소유 🏠"},{value:false,label:"무주택 / 전월세"}]},
  { id:"income", q:null, type:"income" },
];

async function fetchAllServices() {
  const results = await Promise.all(
    Array.from({length:20},(_,i)=>i+1).map(page=>
      fetch(`${BASE_URL}/serviceList?serviceKey=${API_KEY}&page=${page}&perPage=100`)
        .then(r=>r.ok?r.json():{data:[]}).then(j=>j.data||[]).catch(()=>[])
    )
  );
  return results.flat();
}

function filterAndSort(services, profile) {
  const inc=parseInt(profile.income)||200;
  const filtered = services.filter(s=>{
    const cat=s["서비스분야"]||"";
    if (cat==="농림축산어업") return false;
    if (profile.pregnant&&cat==="임신·출산") return true;
    if (inc<=75&&(s["지원대상"]||"").toLowerCase().includes("고소득")) return false;
    return true;
  });
  const pri={"임신·출산":profile.pregnant?0:5,"보건·의료":1,"보육·교육":2,"주거·자립":3,"생활안정":4,"보호·돌봄":4,"고용·창업":5,"문화·환경":6,"행정·안전":7};
  return [...filtered].sort((a,b)=>(pri[a["서비스분야"]]??10)-(pri[b["서비스분야"]]??10));
}
export default function ALDA() {
  const [screen, setScreen] = useState("landing");
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState(null);
  const [profile, setProfile] = useState(()=>{ try{return JSON.parse(localStorage.getItem("alda_profile")||"{}");}catch{return {};} });
  const [services, setServices] = useState([]);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("list");
  const [catFilter, setCatFilter] = useState("전체");
  const [saved, setSaved] = useState(()=>{ try{return JSON.parse(localStorage.getItem("alda_saved")||"[]");}catch{return [];} });
  const [checked, setChecked] = useState(()=>{ try{return JSON.parse(localStorage.getItem("alda_checked")||"{}");}catch{return {};} });
  const [modal, setModal] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [loadingStep, setLoadingStep] = useState(0);
  const loadingRef = useRef(null);

  useEffect(()=>{ if(Object.keys(profile).length>0) localStorage.setItem("alda_profile",JSON.stringify(profile)); },[profile]);
  useEffect(()=>{ localStorage.setItem("alda_saved",JSON.stringify(saved)); },[saved]);
  useEffect(()=>{ localStorage.setItem("alda_checked",JSON.stringify(checked)); },[checked]);
    const abortRef = useRef(null);

  const hasProfile = Object.keys(profile).length>=7;

  const runFetch = async (p) => {
    setScreen("loading"); setLoadingStep(0); setError(null);
    loadingRef.current = setInterval(()=>setLoadingStep(s=>Math.min(s+1,3)),800);
    try {
      const raw = await fetchAllServices();
      setServices(filterAndSort(raw,p));
    } catch { setError("데이터를 불러오는 중 오류가 발생했습니다."); }
    clearInterval(loadingRef.current);
    setLoadingStep(4);
    setTimeout(()=>{ setScreen("results"); setTab("list"); setCatFilter("전체"); },400);
  };

  const handleSelect = useCallback(async (value) => {
    setSelected(value);
    setTimeout(async()=>{
      const cur=STEPS[step];
      const np={...profile,[cur.id]:value};
      setProfile(np); setSelected(null);
      if (step<STEPS.length-1) setStep(step+1);
      else await runFetch(np);
    },200);
  },[step,profile]);

  const toggleSave = useCallback((s)=>{
    const id=s["서비스ID"];
    setSaved(prev=>prev.find(x=>x["서비스ID"]===id)?prev.filter(x=>x["서비스ID"]!==id):[...prev,s]);
  },[]);

  const toggleCheck = useCallback((id)=>{
    setChecked(prev=>({...prev,[id]:!prev[id]}));
  },[]);

  const openModal = useCallback(async(service)=>{
    if(abortRef.current) abortRef.current.abort(); const controller=new AbortController(); abortRef.current=controller; setDetail(null); setDetailLoading(true); setModal(service);
    const id=service["서비스ID"];
    if(id) {
      try {
        const res=await fetch(`${BASE_URL}/serviceDetail?serviceKey=${API_KEY}&serviceId=${id}`,{signal:controller.signal});
        const json=await res.json();
        setDetail(json.data?.[0]||null);
      } catch(e) { if(e.name==='AbortError') return; }
    }
    setDetailLoading(false);
  },[]);

  const cur=STEPS[step];
  const isIncome=cur?.type==="income";
  const incOpts=isIncome?getIncomeOptions(profile.householdSize||4):[];

  const catCounts = {};
  services.forEach(s=>{ const c=s["서비스분야"]||"기타"; catCounts[c]=(catCounts[c]||0)+1; });
  const availCats = ["전체",...Object.keys(CATS).filter(k=>k!=="전체"&&catCounts[k]>0)];

  const displayList = services.filter(s=>{
    const cat=s["서비스분야"]||"기타";
    if (catFilter!=="전체"&&!cat.includes(catFilter)) return false;
    if (!search) return true;
    const q=search.toLowerCase();
    return (s["서비스명"]||"").toLowerCase().includes(q)||(s["서비스분야"]||"").toLowerCase().includes(q);
  });

  const totalBenefit = saved.reduce((sum,s)=>{ const a=parseAmount(s); if(!a)return sum; return sum+(a.type==="월"?a.amount*12:a.amount); },0);
  const timelineList = services.filter(s=>getDeadline(s));
  // ── LANDING (토스 스타일) ──────────────────────────────
  if (screen==="landing") return (
    <div style={{fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif",minHeight:"100vh",background:"#F7F8FA",display:"flex",flexDirection:"column"}}>
      {/* 상단 네비 */}
      <div style={{padding:"1.25rem 1.5rem",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:"1.1rem",fontWeight:900,letterSpacing:"0.12em",color:"#1A1A2E"}}>ALDA</div>
        <div style={{fontSize:"0.8rem",color:"#ADB5BD",background:"#EAECF0",padding:"4px 10px",borderRadius:"20px"}}>정부 혜택 가이드</div>
      </div>

      {/* 히어로 섹션 */}
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"2rem 1.5rem 1rem",textAlign:"center"}}>
        <div style={{display:"inline-flex",alignItems:"center",gap:"6px",background:"#EEF2FF",color:"#4C6EF5",fontSize:"0.78rem",fontWeight:600,padding:"6px 14px",borderRadius:"20px",marginBottom:"1.5rem"}}>
          ✦ 행정안전부 공공서비스 실시간 연동
        </div>
        <h1 style={{fontSize:"clamp(2rem,8vw,3.2rem)",fontWeight:900,color:"#1A1A2E",lineHeight:1.2,marginBottom:"1rem",letterSpacing:"-0.02em"}}>
          내 상황에 꼭 맞는<br/>
          <span style={{background:"linear-gradient(135deg,#4C6EF5,#845EF7)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>정부 혜택</span>을 찾아드려요
        </h1>
        <p style={{fontSize:"1rem",color:"#6C757D",marginBottom:"2.5rem",lineHeight:1.7,maxWidth:"360px"}}>
          임신, 출산, 주거, 취업까지<br/>10,000개 이상 공공서비스 중 나에게 맞는 것만
        </p>

        <button
          onClick={()=>{setScreen("quiz");setStep(0);}}
          style={{width:"100%",maxWidth:"360px",padding:"1.1rem",fontSize:"1.05rem",fontWeight:700,background:"linear-gradient(135deg,#4C6EF5,#845EF7)",color:"white",border:"none",borderRadius:"16px",cursor:"pointer",boxShadow:"0 8px 24px rgba(76,110,245,0.35)",marginBottom:"0.75rem",letterSpacing:"-0.01em"}}>
          내 혜택 찾기 →
        </button>
        {hasProfile && (
          <button
            onClick={()=>runFetch(profile)}
            style={{width:"100%",maxWidth:"360px",padding:"1rem",fontSize:"1rem",fontWeight:600,background:"white",color:"#4C6EF5",border:"2px solid #E8ECFF",borderRadius:"16px",cursor:"pointer"}}>
            💾 저장된 프로필로 바로 조회
          </button>
        )}
      </div>

      {/* 하단 통계 카드 */}
      <div style={{padding:"1.5rem",display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"0.75rem",maxWidth:"480px",margin:"0 auto",width:"100%",boxSizing:"border-box"}}>
        {[["10,000+","등록 서비스"],["전국","지자체 포함"],["무료","완전 무료"]].map(([n,l])=>(
          <div key={l} style={{background:"white",borderRadius:"14px",padding:"1rem",textAlign:"center",boxShadow:"0 2px 12px rgba(0,0,0,0.06)"}}>
            <div style={{fontSize:"1.1rem",fontWeight:800,color:"#1A1A2E",marginBottom:"2px"}}>{n}</div>
            <div style={{fontSize:"0.75rem",color:"#ADB5BD"}}>{l}</div>
          </div>
        ))}
      </div>

      {/* 시나리오 카드들 */}
      <div style={{padding:"0 1.5rem 2rem",maxWidth:"480px",margin:"0 auto",width:"100%",boxSizing:"border-box"}}>
        <div style={{fontSize:"0.82rem",fontWeight:600,color:"#ADB5BD",marginBottom:"0.75rem",textTransform:"uppercase",letterSpacing:"0.05em"}}>이런 분들에게 추천해요</div>
        <div style={{display:"flex",flexDirection:"column",gap:"0.6rem"}}>
          {[["🤱","임신·출산 예정인 부부","첫만남이용권, 산모신생아 지원 등"],["🏠","내 집 마련을 준비 중인 분","청약, 전세대출, 주거급여 등"],["💼","취업·창업을 준비 중인 청년","청년도약계좌, 청년취업지원 등"]].map(([ico,title,sub])=>(
            <div key={title} style={{background:"white",borderRadius:"14px",padding:"1rem 1.25rem",display:"flex",alignItems:"center",gap:"1rem",boxShadow:"0 2px 8px rgba(0,0,0,0.04)",cursor:"pointer"}} onClick={()=>{setScreen("quiz");setStep(0);}}>
              <div style={{fontSize:"1.6rem",flexShrink:0}}>{ico}</div>
              <div>
                <div style={{fontSize:"0.92rem",fontWeight:700,color:"#1A1A2E"}}>{title}</div>
                <div style={{fontSize:"0.78rem",color:"#ADB5BD",marginTop:"2px"}}>{sub}</div>
              </div>
              <div style={{marginLeft:"auto",color:"#CED4DA",fontSize:"1rem"}}>›</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
  // ── LOADING ──────────────────────────────────────────
  if (screen==="loading") {
    const steps=["프로필 분석 중","서비스 데이터 수집 중","조건 매칭 중","결과 정렬 중"];
    return (
      <div style={{fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif",minHeight:"100vh",background:"#F7F8FA",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"2rem"}}>
        <div style={{width:"64px",height:"64px",borderRadius:"20px",background:"linear-gradient(135deg,#4C6EF5,#845EF7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"2rem",marginBottom:"2rem",boxShadow:"0 8px 24px rgba(76,110,245,0.3)"}}>🔍</div>
        <div style={{fontSize:"1.3rem",fontWeight:700,color:"#1A1A2E",marginBottom:"0.5rem"}}>맞춤 혜택을 찾는 중</div>
        <div style={{fontSize:"0.9rem",color:"#ADB5BD",marginBottom:"2rem"}}>{steps[Math.min(loadingStep,3)]}</div>
        <div style={{width:"240px",height:"6px",background:"#E9ECEF",borderRadius:"3px",overflow:"hidden"}}>
          <div style={{height:"100%",width:`${Math.min((loadingStep/4)*100,95)}%`,background:"linear-gradient(90deg,#4C6EF5,#845EF7)",borderRadius:"3px",transition:"width 0.6s ease"}}/>
        </div>
        <div style={{marginTop:"1rem",display:"flex",gap:"0.5rem"}}>
          {steps.map((s,i)=>(
            <div key={i} style={{width:"6px",height:"6px",borderRadius:"50%",background:i<=loadingStep?"#4C6EF5":"#E9ECEF",transition:"background 0.3s"}}/>
          ))}
        </div>
      </div>
    );
  }

  // ── QUIZ ──────────────────────────────────────────────
  if (screen==="quiz") {
    const progress=(step/STEPS.length)*100;
    const question=isIncome?`${profile.householdSize||4}인 가구 기준,\n월 소득이 얼마예요?`:cur.q;
    return (
      <div style={{fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif",minHeight:"100vh",background:"#F7F8FA"}}>
        {/* 헤더 */}
        <div style={{padding:"1.25rem 1.5rem",display:"flex",alignItems:"center",gap:"1rem",maxWidth:"520px",margin:"0 auto"}}>
          <button style={{background:"none",border:"none",color:"#ADB5BD",cursor:"pointer",fontSize:"1.2rem",padding:"4px"}} onClick={()=>step>0?setStep(step-1):setScreen("landing")}>‹</button>
          <div style={{flex:1,height:"6px",background:"#E9ECEF",borderRadius:"3px",overflow:"hidden"}}>
            <div style={{height:"100%",width:progress+"%",background:"linear-gradient(90deg,#4C6EF5,#845EF7)",borderRadius:"3px",transition:"width 0.4s ease"}}/>
          </div>
          <span style={{fontSize:"0.8rem",color:"#ADB5BD",whiteSpace:"nowrap"}}>{step+1}/{STEPS.length}</span>
        </div>

        <div style={{padding:"1rem 1.5rem 2rem",maxWidth:"520px",margin:"0 auto"}}>
          <div style={{marginBottom:"2rem"}}>
            <div style={{fontSize:"clamp(1.2rem,4vw,1.5rem)",fontWeight:800,color:"#1A1A2E",lineHeight:1.4,whiteSpace:"pre-line"}}>{question}</div>
            {isIncome&&<div style={{fontSize:"0.82rem",color:"#ADB5BD",marginTop:"0.5rem"}}>세전 월 소득 기준 · 근로·사업·재산 소득 포함</div>}
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:"0.6rem"}}>
            {(isIncome?incOpts:cur.opts).map((opt,i)=>{
              const isSelected=selected===opt.value;
              return (
                <button key={String(opt.value)+i}
                  style={{padding:isIncome?"1rem 1.25rem":"0.9rem 1.25rem",background:isSelected?"linear-gradient(135deg,#4C6EF5,#845EF7)":"white",color:isSelected?"white":"#1A1A2E",border:isSelected?"none":"2px solid #E9ECEF",borderRadius:"14px",cursor:"pointer",fontSize:"1rem",fontWeight:isSelected?700:500,textAlign:"left",transition:"all 0.15s",boxShadow:isSelected?"0 4px 16px rgba(76,110,245,0.3)":"0 2px 8px rgba(0,0,0,0.04)"}}
                  onClick={()=>handleSelect(opt.value)}>
                  {isIncome?(
                    <div>
                      <div style={{fontWeight:700,fontSize:"1rem"}}>{opt.label}</div>
                      <div style={{fontSize:"0.78rem",opacity:0.7,marginTop:"2px"}}>{opt.sub}</div>
                    </div>
                  ):opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }
  // ── RESULTS ───────────────────────────────────────────
  if (screen==="results") {
    const regionShort=(profile.region||"").replace("특별시","").replace("광역시","").replace("특별자치시","").replace("특별자치도","").replace("도","");
    const TABS=[{id:"list",label:"혜택 목록"},{id:"saved",label:`내 목록 ${saved.length>0?"("+saved.length+")":""}`},{id:"timeline",label:"타임라인"},{id:"calculator",label:"계산기"}];

    return (
      <div style={{fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif",minHeight:"100vh",background:"#F7F8FA"}}>
        {/* 스티키 헤더 */}
        <div style={{position:"sticky",top:0,background:"rgba(247,248,250,0.95)",backdropFilter:"blur(12px)",zIndex:100,borderBottom:"1px solid #F1F3F5"}}>
          <div style={{padding:"1rem 1.25rem",maxWidth:"720px",margin:"0 auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"0.75rem"}}>
              <div>
                <div style={{fontSize:"1.1rem",fontWeight:800,color:"#1A1A2E"}}>나에게 맞는 혜택</div>
                <div style={{fontSize:"0.78rem",color:"#ADB5BD",marginTop:"1px"}}>{regionShort} · {profile.age}세 · 소득 {profile.income}% 이하</div>
              </div>
              <div style={{display:"flex",gap:"0.4rem"}}>
                <button style={{padding:"0.4rem 0.85rem",background:"white",color:"#4C6EF5",border:"1.5px solid #E8ECFF",borderRadius:"20px",cursor:"pointer",fontSize:"0.82rem",fontWeight:600}} onClick={()=>{setScreen("quiz");setStep(0);}}>재검색</button>
                <button style={{padding:"0.4rem 0.85rem",background:"#1A1A2E",color:"white",border:"none",borderRadius:"20px",cursor:"pointer",fontSize:"0.82rem",fontWeight:600}} onClick={()=>setScreen("landing")}>홈</button>
              </div>
            </div>
            {/* 탭 */}
            <div style={{display:"flex",gap:"0.4rem",overflowX:"auto",paddingBottom:"2px"}}>
              {TABS.map(t=>(
                <button key={t.id} style={{padding:"0.4rem 1rem",borderRadius:"20px",border:"none",background:tab===t.id?"#1A1A2E":"#EAECF0",color:tab===t.id?"white":"#6C757D",cursor:"pointer",fontSize:"0.85rem",fontWeight:tab===t.id?700:500,whiteSpace:"nowrap",transition:"all 0.15s"}}
                  onClick={()=>setTab(t.id)}>{t.label}</button>
              ))}
            </div>
          </div>
        </div>

        <div style={{padding:"1rem 1.25rem 3rem",maxWidth:"720px",margin:"0 auto"}}>
          {error&&<div style={{background:"#FFF5F5",border:"1px solid #FFD6D6",color:"#C92A2A",padding:"0.75rem 1rem",borderRadius:"12px",marginBottom:"1rem",fontSize:"0.9rem"}}>{error}</div>}

          {/* ── 혜택 목록 탭 ── */}
          {tab==="list"&&<>
            {/* 검색 */}
            <div style={{position:"relative",marginBottom:"1rem"}}>
              <span style={{position:"absolute",left:"1rem",top:"50%",transform:"translateY(-50%)",color:"#ADB5BD",fontSize:"1rem"}}>🔍</span>
              <input style={{width:"100%",padding:"0.8rem 1rem 0.8rem 2.5rem",border:"2px solid #E9ECEF",borderRadius:"12px",fontSize:"0.95rem",background:"white",boxSizing:"border-box",outline:"none"}}
                placeholder="혜택명으로 검색..." value={search} onChange={e=>setSearch(e.target.value)}/>
            </div>

            {/* 카테고리 필터 칩 */}
            <div style={{display:"flex",gap:"0.5rem",overflowX:"auto",marginBottom:"1.25rem",paddingBottom:"2px"}}>
              {availCats.map(cat=>{
                const c=CATS[cat]||{icon:"📋",color:"#ADB5BD"};
                const isActive=catFilter===cat;
                const cnt=cat==="전체"?services.length:(catCounts[cat]||0);
                return (
                  <button key={cat} style={{display:"flex",alignItems:"center",gap:"4px",padding:"0.45rem 0.9rem",borderRadius:"20px",border:"none",background:isActive?c.color:"white",color:isActive?"white":"#495057",cursor:"pointer",fontSize:"0.82rem",fontWeight:isActive?700:500,whiteSpace:"nowrap",boxShadow:isActive?"0 4px 12px rgba(0,0,0,0.15)":"0 2px 6px rgba(0,0,0,0.06)",transition:"all 0.15s"}}
                    onClick={()=>setCatFilter(cat)}>
                    <span>{c.icon}</span>
                    <span>{cat==="전체"?"전체":cat.split("·")[0]}</span>
                    <span style={{fontSize:"0.72rem",opacity:0.8}}>({cnt})</span>
                  </button>
                );
              })}
            </div>

            {/* 결과 수 */}
            <div style={{fontSize:"0.82rem",color:"#ADB5BD",marginBottom:"0.75rem"}}>{displayList.length}개 서비스</div>

            {/* 카드 리스트 */}
            {displayList.length===0
              ?<div style={{textAlign:"center",padding:"3rem",color:"#ADB5BD"}}><div style={{fontSize:"2rem",marginBottom:"0.5rem"}}>😔</div><div>조건에 맞는 혜택을 찾지 못했어요</div></div>
              :displayList.map((s,i)=>{
                const cat=s["서비스분야"]||"기타"; const cc=getCat(cat); const fit=calcFit(s,profile);
                const isSv=!!saved.find(x=>x["서비스ID"]===s["서비스ID"]); const dl=getDeadline(s);
                const amt=parseAmount(s);
                return (
                  <div key={s["서비스ID"]||i}
                    style={{background:"white",borderRadius:"16px",padding:"1.1rem 1.25rem",marginBottom:"0.6rem",cursor:"pointer",boxShadow:"0 2px 8px rgba(0,0,0,0.05)",border:"1px solid #F1F3F5",transition:"all 0.15s"}}
                    onClick={()=>openModal(s)}
                    onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 8px 24px rgba(0,0,0,0.1)";e.currentTarget.style.transform="translateY(-1px)";}}
                    onMouseLeave={e=>{e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,0.05)";e.currentTarget.style.transform="";}}>
                    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:"0.5rem"}}>
                      <div style={{flex:1,minWidth:0}}>
                        {/* 태그 행 */}
                        <div style={{display:"flex",alignItems:"center",gap:"0.4rem",marginBottom:"0.4rem",flexWrap:"wrap"}}>
                          <span style={{fontSize:"0.72rem",fontWeight:700,padding:"2px 8px",borderRadius:"20px",color:"white",background:cc.color}}>{cc.icon} {cat.split("·")[0]}</span>
                          <span style={{fontSize:"0.72rem",fontWeight:700,padding:"2px 8px",borderRadius:"20px",color:"white",background:fit.color}}>{fit.badge}</span>
                          {dl&&<span style={{fontSize:"0.72rem",fontWeight:600,padding:"2px 8px",borderRadius:"20px",color:"#E65100",background:"#FFF3E0"}}>⏰ {dl.label}</span>}
                        </div>
                        {/* 서비스명 */}
                        <div style={{fontSize:"0.98rem",fontWeight:700,color:"#1A1A2E",marginBottom:"0.25rem",lineHeight:1.4}}>{s["서비스명"]||"서비스명 없음"}</div>
                        {/* 설명 */}
                        <div style={{fontSize:"0.83rem",color:"#868E96",lineHeight:1.5}}>{(s["지원내용"]||s["서비스목적요약"]||"").slice(0,70)}{(s["지원내용"]||"").length>70?"...":""}</div>
                        {/* 금액 */}
                        {amt&&<div style={{fontSize:"0.85rem",fontWeight:700,color:cc.color,marginTop:"0.3rem"}}>{amt.type==="월"?`월 ${amt.amount}만원`:`${amt.amount}만원`}</div>}
                      </div>
                      {/* 저장 버튼 */}
                      <button style={{background:"none",border:"none",fontSize:"1.2rem",cursor:"pointer",flexShrink:0,color:isSv?"#4C6EF5":"#DEE2E6",padding:"2px"}}
                        onClick={e=>{e.stopPropagation();toggleSave(s);}}>🔖</button>
                    </div>
                  </div>
                );
              })
            }
          </>}
          {/* ── 내 목록 탭 ── */}
          {tab==="saved"&&<>
            {saved.length===0
              ?<div style={{textAlign:"center",padding:"3rem",color:"#ADB5BD"}}><div style={{fontSize:"2rem"}}>🔖</div><div style={{marginTop:"0.5rem",fontWeight:600}}>저장된 혜택이 없어요</div><div style={{fontSize:"0.85rem",marginTop:"0.3rem"}}>목록에서 🔖를 눌러 관심 혜택을 저장하세요</div></div>
              :<>
                <div style={{background:"linear-gradient(135deg,#EEF2FF,#F3F0FF)",borderRadius:"14px",padding:"1rem 1.25rem",marginBottom:"1rem",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div><div style={{fontSize:"0.82rem",color:"#6C757D"}}>신청 진행 현황</div><div style={{fontSize:"1.1rem",fontWeight:800,color:"#4C6EF5"}}>{Object.values(checked).filter(Boolean).length}<span style={{fontSize:"0.9rem",fontWeight:500,color:"#868E96"}}> / {saved.length}개 완료</span></div></div>
                  <div style={{fontSize:"2rem"}}>{Object.values(checked).filter(Boolean).length===saved.length&&saved.length>0?"🎉":"📋"}</div>
                </div>
                {saved.map((s,i)=>{const id=s["서비스ID"]||String(i);const isC=!!checked[id];const cc=getCat(s["서비스분야"]||"기타");return(
                  <div key={id} style={{background:"white",borderRadius:"14px",padding:"1rem 1.25rem",marginBottom:"0.6rem",border:`1.5px solid ${isC?"#D3F9D8":"#F1F3F5"}`,opacity:isC?0.7:1,cursor:"pointer"}} onClick={()=>openModal(s)}>
                    <div style={{display:"flex",alignItems:"center",gap:"0.75rem"}}>
                      <div style={{width:"36px",height:"36px",borderRadius:"10px",background:isC?"#D3F9D8":"#F1F3F5",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.1rem",flexShrink:0}}>{isC?"✅":cc.icon}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:"0.75rem",color:cc.color,fontWeight:600}}>{s["서비스분야"]}</div>
                        <div style={{fontSize:"0.95rem",fontWeight:700,color:isC?"#ADB5BD":"#1A1A2E",textDecoration:isC?"line-through":"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s["서비스명"]}</div>
                      </div>
                      <div style={{display:"flex",gap:"0.4rem",alignItems:"center",flexShrink:0}}>
                        <button style={{padding:"0.35rem 0.75rem",background:isC?"#40C057":"#F1F3F5",color:isC?"white":"#495057",border:"none",borderRadius:"8px",cursor:"pointer",fontSize:"0.8rem",fontWeight:600}}
                          onClick={e=>{e.stopPropagation();toggleCheck(id);}}>{isC?"완료":"신청"}</button>
                        <button style={{background:"none",border:"none",color:"#DEE2E6",cursor:"pointer",fontSize:"0.9rem"}} onClick={e=>{e.stopPropagation();toggleSave(s);}}>✕</button>
                      </div>
                    </div>
                  </div>
                );})}
              </>}
          </>}

          {/* ── 타임라인 탭 ── */}
          {tab==="timeline"&&<>
            <div style={{background:"#E8F5E9",borderRadius:"12px",padding:"0.75rem 1rem",marginBottom:"1rem",fontSize:"0.85rem",color:"#2E7D32",fontWeight:500}}>📅 기한이 있는 혜택은 먼저 신청하세요</div>
            {timelineList.length===0
              ?<div style={{textAlign:"center",padding:"3rem",color:"#ADB5BD"}}><div style={{fontSize:"2rem"}}>📅</div><div style={{marginTop:"0.5rem"}}>타임라인 혜택이 없어요</div></div>
              :timelineList.map((s,i)=>{const dl=getDeadline(s);const cc=getCat(s["서비스분야"]||"기타");const isSv=!!saved.find(x=>x["서비스ID"]===s["서비스ID"]);return(
                <div key={s["서비스ID"]||i} style={{display:"flex",gap:"1rem",padding:"1rem",background:"white",borderRadius:"14px",marginBottom:"0.6rem",boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
                  <div style={{width:"4px",borderRadius:"4px",background:cc.color,flexShrink:0}}/>
                  <div style={{flex:1,cursor:"pointer"}} onClick={()=>openModal(s)}>
                    <div style={{fontSize:"0.75rem",color:"#E65100",fontWeight:700,marginBottom:"0.2rem"}}>⏰ {dl.label}</div>
                    <div style={{fontSize:"0.95rem",fontWeight:700,color:"#1A1A2E"}}>{s["서비스명"]}</div>
                    <div style={{fontSize:"0.82rem",color:"#868E96",marginTop:"2px"}}>{(s["지원내용"]||"").slice(0,55)}...</div>
                  </div>
                  <button style={{background:"none",border:"none",fontSize:"1.1rem",cursor:"pointer",color:isSv?"#4C6EF5":"#DEE2E6",flexShrink:0}} onClick={()=>toggleSave(s)}>🔖</button>
                </div>
              );})}
          </>}

          {/* ── 계산기 탭 ── */}
          {tab==="calculator"&&(
            <div style={{background:"white",borderRadius:"16px",padding:"1.5rem",boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
              <div style={{fontSize:"1rem",fontWeight:700,color:"#1A1A2E",marginBottom:"1rem"}}>💰 예상 연간 수혜액</div>
              {saved.length===0
                ?<div style={{textAlign:"center",padding:"2rem",color:"#ADB5BD",fontSize:"0.9rem"}}>🔖 내 목록에 혜택을 저장하면<br/>예상 수혜액을 계산해드려요</div>
                :<>
                  <div style={{background:"linear-gradient(135deg,#1A1A2E,#4C6EF5)",borderRadius:"16px",padding:"1.75rem",textAlign:"center",marginBottom:"1.25rem"}}>
                    <div style={{fontSize:"0.85rem",color:"rgba(255,255,255,0.7)",marginBottom:"0.3rem"}}>예상 연간 수혜 총액</div>
                    <div style={{fontSize:"2.8rem",fontWeight:900,color:"white",letterSpacing:"-0.02em"}}>{totalBenefit.toLocaleString()}<span style={{fontSize:"1.2rem"}}>만원</span></div>
                    <div style={{fontSize:"0.75rem",color:"rgba(255,255,255,0.5)",marginTop:"0.4rem"}}>※ 심사 결과에 따라 실제 수혜액은 다를 수 있어요</div>
                  </div>
                  {saved.map((s,i)=>{const a=parseAmount(s);const cc=getCat(s["서비스분야"]||"기타");return(
                    <div key={s["서비스ID"]||i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.75rem 0",borderBottom:"1px solid #F8F9FA"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:"0.72rem",color:cc.color,fontWeight:600}}>{s["서비스분야"]}</div>
                        <div style={{fontSize:"0.9rem",fontWeight:600,color:"#1A1A2E",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s["서비스명"]}</div>
                      </div>
                      <div style={{textAlign:"right",marginLeft:"0.75rem",flexShrink:0}}>
                        {a?<div style={{fontSize:"0.9rem",fontWeight:700,color:"#4C6EF5"}}>{a.type==="월"?`월 ${a.amount}만원`:`${a.amount}만원`}</div>:<div style={{fontSize:"0.82rem",color:"#CED4DA"}}>금액 미공개</div>}
                      </div>
                    </div>
                  );})}
                </>}
            </div>
          )}
        </div>

        {/* ── 상세 모달 ── */}
        {modal&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200,padding:"0"}} onClick={e=>{if(e.target===e.currentTarget)setModal(null);}}>
            <div style={{background:"white",borderRadius:"24px 24px 0 0",width:"100%",maxWidth:"600px",maxHeight:"88vh",overflowY:"auto",padding:"0 0 2rem"}}>
              {/* 핸들 */}
              <div style={{display:"flex",justifyContent:"center",padding:"0.75rem 0 0"}}>
                <div style={{width:"36px",height:"4px",background:"#DEE2E6",borderRadius:"2px"}}/>
              </div>
              <div style={{padding:"1rem 1.5rem 0"}}>
                {/* 배지 + 저장 */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.75rem"}}>
                  <div style={{display:"flex",gap:"0.4rem",flexWrap:"wrap"}}>
                    {(()=>{const cc=getCat(modal["서비스분야"]||"기타");const fit=calcFit(modal,profile);return(<>
                      <span style={{fontSize:"0.75rem",fontWeight:700,padding:"3px 10px",borderRadius:"20px",color:"white",background:cc.color}}>{cc.icon} {(modal["서비스분야"]||"").split("·")[0]}</span>
                      <span style={{fontSize:"0.75rem",fontWeight:700,padding:"3px 10px",borderRadius:"20px",color:"white",background:fit.color}}>{fit.badge}</span>
                    </>);})()}
                  </div>
                  <button style={{fontSize:"0.85rem",fontWeight:600,padding:"5px 12px",borderRadius:"20px",border:"none",cursor:"pointer",background:saved.find(x=>x["서비스ID"]===modal["서비스ID"])?"#EEF2FF":"#F8F9FA",color:saved.find(x=>x["서비스ID"]===modal["서비스ID"])?"#4C6EF5":"#868E96"}}
                    onClick={()=>toggleSave(modal)}>
                    {saved.find(x=>x["서비스ID"]===modal["서비스ID"])?"🔖 저장됨":"🔖 저장"}
                  </button>
                </div>
                {/* 제목 */}
                <div style={{fontSize:"1.25rem",fontWeight:800,color:"#1A1A2E",lineHeight:1.4,marginBottom:"1.25rem"}}>{modal["서비스명"]}</div>

                {detailLoading?<div style={{textAlign:"center",padding:"3rem",color:"#ADB5BD"}}>불러오는 중...</div>:<>
                  {[["지원내용",detail?.["지원내용"]||modal["지원내용"]],["지원대상",detail?.["지원대상"]||modal["지원대상"]],["선정기준",detail?.["선정기준"]||modal["선정기준"]],["신청방법",detail?.["신청방법"]||modal["신청방법"]],["담당기관",detail?.["소관기관명"]||modal["소관기관명"]],["문의",detail?.["전화문의"]||modal["전화문의"]]].map(([l,v])=>v?(
                    <div key={l} style={{marginBottom:"1rem",paddingBottom:"1rem",borderBottom:"1px solid #F8F9FA"}}>
                      <div style={{fontSize:"0.75rem",fontWeight:700,color:"#ADB5BD",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:"0.3rem"}}>{l}</div>
                      <div style={{fontSize:"0.92rem",color:"#343A40",lineHeight:1.7}}>{v}</div>
                    </div>
                  ):null)}
                  <a href={(detail?.["온라인신청사이트URL"]||modal["온라인신청사이트URL"])||"https://www.gov.kr/portal/service/serviceList"} target="_blank" rel="noopener noreferrer"
                    style={{display:"block",width:"100%",padding:"1rem",background:"linear-gradient(135deg,#4C6EF5,#845EF7)",color:"white",border:"none",borderRadius:"14px",fontSize:"1rem",fontWeight:700,cursor:"pointer",textDecoration:"none",textAlign:"center",boxSizing:"border-box",marginTop:"0.5rem"}}>
                    신청하기 →
                  </a>
                </>}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
  return null;
      }
