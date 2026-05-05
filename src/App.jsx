import { useState, useCallback, useEffect } from "react";

const API_KEY = import.meta.env.VITE_API_KEY;
const BASE_URL = "https://api.odcloud.kr/api/gov24/v3";

const MEDIAN_INCOME = { 1:239, 2:393, 3:505, 4:613, 5:718, 6:819 };

function getIncomeOptions(n) {
  const base = MEDIAN_INCOME[n] || MEDIAN_INCOME[4];
  return [
    { value:"30",  label:`월 ${Math.round(base*0.3)}만원 이하`,  sub:"중위소득 30% · 기초생활수급자 수준" },
    { value:"50",  label:`월 ${Math.round(base*0.5)}만원 이하`,  sub:"중위소득 50% · 차상위계층 수준" },
    { value:"75",  label:`월 ${Math.round(base*0.75)}만원 이하`, sub:"중위소득 75%" },
    { value:"100", label:`월 ${Math.round(base*1.0)}만원 이하`,  sub:"중위소득 100% · 중간 소득 수준" },
    { value:"150", label:`월 ${Math.round(base*1.5)}만원 이하`,  sub:"중위소득 150%" },
    { value:"200+",label:`월 ${Math.round(base*1.5)}만원 초과`,  sub:"중위소득 150% 초과" },
  ];
}

function parseAmount(service) {
  const text = (service["지원내용"]||"") + (service["서비스목적요약"]||"");
  const m = text.match(/월\s*(\d+[,]?\d*)\s*만원/);
  const o = text.match(/(\d+[,]?\d*)\s*만원/);
  if (m) return { type:"월", amount: parseInt(m[1].replace(",","")) };
  if (o) return { type:"일시", amount: parseInt(o[1].replace(",","")) };
  return null;
}

const DEADLINE_KEYWORDS = [
  { keywords:["첫만남","출생"], label:"출생 후 60일 이내 신청" },
  { keywords:["영아수당","아동수당"], label:"출생 후 신청 (매월 지급)" },
  { keywords:["고위험 임산부"], label:"임신 중 신청" },
  { keywords:["임산부 외래"], label:"임신 중 신청" },
  { keywords:["출산휴가","출산전후"], label:"출산 전후 신청" },
  { keywords:["육아휴직"], label:"복직 전까지 신청" },
  { keywords:["난임"], label:"치료 전 신청 필요" },
];

function getDeadlineInfo(service) {
  const name = service["서비스명"]||"";
  for (const d of DEADLINE_KEYWORDS) {
    if (d.keywords.some(k => name.includes(k))) return d;
  }
  return null;
}

function calcFitScore(service, profile) {
  const cat = service["서비스분야"]||"";
  const combined = ((service["지원대상"]||"") + (service["선정기준"]||"")).toLowerCase();
  let score = 0; let reasons = []; let warnings = [];
  if (profile.pregnant && cat==="임신·출산") { score+=40; reasons.push("임신·출산 해당"); }
  const income = parseInt(profile.income)||200;
  if (combined.includes("기초생활") && income<=30) { score+=30; reasons.push("소득 조건 충족"); }
  else if (combined.includes("차상위") && income<=50) { score+=25; reasons.push("소득 조건 충족"); }
  else if (combined.includes("중위소득 75") && income<=75) { score+=20; reasons.push("소득 조건 충족"); }
  else if (combined.includes("중위소득 100") && income<=100) { score+=15; reasons.push("소득 조건 충족"); }
  else if (!combined.includes("중위소득") && !combined.includes("소득기준")) { score+=10; reasons.push("소득 무관 혜택"); }
  else if (combined.includes("중위소득") && income>100) { warnings.push("소득 기준 초과 가능"); }
  if (!profile.house && combined.includes("무주택")) { score+=20; reasons.push("무주택 조건 충족"); }
  if (score===0) score=5;
  let badge, badgeColor;
  if (warnings.length>0 && score<20) { badge="조건 확인 필요"; badgeColor="#FF9800"; }
  else if (score>=35) { badge="신청 가능 예상"; badgeColor="#4CAF50"; }
  else if (score>=15) { badge="검토 추천"; badgeColor="#2196F3"; }
  else { badge="참고용"; badgeColor="#9E9E9E"; }
  return { score, badge, badgeColor, reasons, warnings };
}

function getAgeRange(v) {
  return ({"0-2":[0,2],"3-6":[3,6],"7-12":[7,12],"13-18":[13,18],"19-24":[19,24],"25-34":[25,34],"35-44":[35,44],"45-54":[45,54],"55-64":[55,64],"65-74":[65,74],"75+":[75,120]})[v]||[0,120];
}

const CAT_COLOR = {
  "임신·출산":{accent:"#E91E63",tag:"🤱"}, "보육·교육":{accent:"#9C27B0",tag:"📚"},
  "주거·자립":{accent:"#2196F3",tag:"🏠"}, "고용·창업":{accent:"#FF9800",tag:"💼"},
  "보건·의료":{accent:"#F44336",tag:"🏥"}, "생활안정":{accent:"#4CAF50",tag:"💚"},
  "보호·돌봄":{accent:"#00BCD4",tag:"🤝"}, "문화·환경":{accent:"#FF5722",tag:"🎭"},
  "행정·안전":{accent:"#607D8B",tag:"🔒"}, "기타":{accent:"#9E9E9E",tag:"📋"},
};
function getColor(cat) {
  for (const k of Object.keys(CAT_COLOR)) { if (cat&&cat.includes(k)) return CAT_COLOR[k]; }
  return CAT_COLOR["기타"];
}

const STEPS = [
  { id:"age", label:"나이", question:"만 나이가 어떻게 되세요?", options:[
    {value:"0-2",label:"만 0~2세"},{value:"3-6",label:"만 3~6세"},{value:"7-12",label:"만 7~12세"},
    {value:"13-18",label:"만 13~18세"},{value:"19-24",label:"만 19~24세"},{value:"25-34",label:"만 25~34세"},
    {value:"35-44",label:"만 35~44세"},{value:"45-54",label:"만 45~54세"},{value:"55-64",label:"만 55~64세"},
    {value:"65-74",label:"만 65~74세"},{value:"75+",label:"만 75세 이상"},
  ]},
  { id:"region", label:"지역", question:"현재 거주하시는 지역은?", options:[
    {value:"서울특별시",label:"서울"},{value:"부산광역시",label:"부산"},{value:"대구광역시",label:"대구"},
    {value:"인천광역시",label:"인천"},{value:"광주광역시",label:"광주"},{value:"대전광역시",label:"대전"},
    {value:"울산광역시",label:"울산"},{value:"세종특별자치시",label:"세종"},{value:"경기도",label:"경기"},
    {value:"강원특별자치도",label:"강원"},{value:"충청북도",label:"충북"},{value:"충청남도",label:"충남"},
    {value:"전북특별자치도",label:"전북"},{value:"전라남도",label:"전남"},{value:"경상북도",label:"경북"},
    {value:"경상남도",label:"경남"},{value:"제주특별자치도",label:"제주"},
  ]},
  { id:"householdSize", label:"가구", question:"가구원 수가 어떻게 되세요?",
    options:[1,2,3,4,5,6].map(n=>({value:n,label:`${n}인 가구`}))},
  { id:"married", label:"결혼", question:"결혼 여부를 알려주세요",
    options:[{value:true,label:"기혼 / 사실혼"},{value:false,label:"미혼"}]},
  { id:"pregnant", label:"임신·출산", question:"임신 중이거나 출산 후 1년 이내인가요?",
    options:[{value:true,label:"해당돼요"},{value:false,label:"해당 없어요"}]},
  { id:"house", label:"주택", question:"내 집이 있나요?",
    options:[{value:true,label:"자가 소유"},{value:false,label:"무주택 / 전월세"}]},
  { id:"income", label:"소득", question:null, type:"income" },
];
async function fetchAllServices() {
  const pages = Array.from({length:20},(_,i)=>i+1);
  const results = await Promise.all(pages.map(page=>
    fetch(`${BASE_URL}/serviceList?serviceKey=${API_KEY}&page=${page}&perPage=100`)
      .then(r=>r.ok?r.json():{data:[]}).then(j=>j.data||[]).catch(()=>[])
  ));
  return results.flat();
}

function filterByProfile(services, profile) {
  const income = parseInt(profile.income)||200;
  return services.filter(s => {
    const cat = s["서비스분야"]||"";
    if (cat==="농림축산어업") return false;
    if (profile.pregnant && cat==="임신·출산") return true;
    if (income<=75 && (s["지원대상"]||"").toLowerCase().includes("고소득")) return false;
    return true;
  });
}

function sortServices(services, profile) {
  const pri = {"임신·출산":profile.pregnant?0:5,"보건·의료":1,"보육·교육":2,"주거·자립":3,"생활안정":4,"보호·돌봄":4,"고용·창업":5,"문화·환경":6,"행정·안전":7};
  return [...services].sort((a,b)=>(pri[a["서비스분야"]]??10)-(pri[b["서비스분야"]]??10));
}

export default function ALDA() {
  const [screen, setScreen] = useState("landing");
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState(() => {
    try { return JSON.parse(localStorage.getItem("alda_profile")||"{}"); } catch { return {}; }
  });
  const [services, setServices] = useState([]);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("list");
  const [saved, setSaved] = useState(() => {
    try { return JSON.parse(localStorage.getItem("alda_saved")||"[]"); } catch { return []; }
  });
  const [checked, setChecked] = useState(() => {
    try { return JSON.parse(localStorage.getItem("alda_checked")||"{}"); } catch { return {}; }
  });
  const [selectedService, setSelectedService] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => { if (Object.keys(profile).length>0) localStorage.setItem("alda_profile",JSON.stringify(profile)); }, [profile]);
  useEffect(() => { localStorage.setItem("alda_saved",JSON.stringify(saved)); }, [saved]);
  useEffect(() => { localStorage.setItem("alda_checked",JSON.stringify(checked)); }, [checked]);

  const hasSavedProfile = Object.keys(profile).length >= 7;

  const handleStart = () => { setScreen("quiz"); setStep(0); };
  const handleContinue = async () => {
    setScreen("loading"); setError(null);
    try {
      const raw = await fetchAllServices();
      setServices(sortServices(filterByProfile(raw,profile),profile));
    } catch { setError("데이터를 불러오는 중 오류가 발생했습니다."); }
    setScreen("results"); setTab("list");
  };

  const handleSelect = useCallback(async (value) => {
    const cur = STEPS[step];
    const np = {...profile,[cur.id]:value};
    setProfile(np);
    if (step<STEPS.length-1) { setStep(step+1); }
    else {
      setScreen("loading"); setError(null);
      try {
        const raw = await fetchAllServices();
        setServices(sortServices(filterByProfile(raw,np),np));
      } catch { setError("데이터를 불러오는 중 오류가 발생했습니다."); }
      setScreen("results"); setTab("list");
    }
  }, [step,profile]);

  const toggleSave = useCallback((s) => {
    const id = s["서비스ID"];
    setSaved(prev=>prev.find(x=>x["서비스ID"]===id)?prev.filter(x=>x["서비스ID"]!==id):[...prev,s]);
  }, []);

  const toggleCheck = useCallback((id) => {
    setChecked(prev=>({...prev,[id]:!prev[id]}));
  }, []);

  const handleCardClick = useCallback(async (service) => {
    setSelectedService(service); setDetail(null); setDetailLoading(true);
    const id = service["서비스ID"];
    if (id) {
      try {
        const res = await fetch(`${BASE_URL}/serviceDetail?serviceKey=${API_KEY}&serviceId=${id}`);
        const json = await res.json();
        setDetail(json.data?.[0]||null);
      } catch {}
    }
    setDetailLoading(false);
  }, []);

  const cur = STEPS[step];
  const isIncome = cur?.type==="income";
  const incomeOpts = isIncome ? getIncomeOptions(profile.householdSize||4) : [];
  const displayedList = services.filter(s=>{
    if (!searchQuery) return true;
    const q=searchQuery.toLowerCase();
    return (s["서비스명"]||"").toLowerCase().includes(q)||(s["서비스분야"]||"").toLowerCase().includes(q);
  });
  const totalBenefit = saved.reduce((sum,s)=>{const a=parseAmount(s);if(!a)return sum;return sum+(a.type==="월"?a.amount*12:a.amount);},0);
  const timelineServices = services.filter(s=>getDeadlineInfo(s));
  const S = {
    app:{fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif",minHeight:"100vh",background:"#f8f9fa"},
    landing:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"linear-gradient(135deg,#1a237e 0%,#283593 50%,#3949ab 100%)",color:"white",padding:"2rem",textAlign:"center"},
    startBtn:{padding:"1rem 3rem",fontSize:"1.1rem",fontWeight:700,background:"white",color:"#1a237e",border:"none",borderRadius:"50px",cursor:"pointer",boxShadow:"0 4px 20px rgba(0,0,0,0.3)"},
    resumeBtn:{padding:"0.75rem 2rem",fontSize:"1rem",fontWeight:600,background:"rgba(255,255,255,0.15)",color:"white",border:"2px solid rgba(255,255,255,0.4)",borderRadius:"50px",cursor:"pointer",marginTop:"1rem"},
    quiz:{display:"flex",flexDirection:"column",alignItems:"center",minHeight:"100vh",padding:"2rem 1rem",background:"#f8f9fa"},
    qCard:{background:"white",borderRadius:"16px",padding:"2rem",maxWidth:"500px",width:"100%",boxShadow:"0 2px 12px rgba(0,0,0,0.08)"},
    optBtn:{display:"block",width:"100%",padding:"0.85rem 1.25rem",marginBottom:"0.75rem",background:"#f5f7fa",border:"2px solid transparent",borderRadius:"10px",cursor:"pointer",fontSize:"1rem",fontWeight:500,textAlign:"left"},
    incBtn:{display:"block",width:"100%",padding:"0.9rem 1.25rem",marginBottom:"0.75rem",background:"#f5f7fa",border:"2px solid transparent",borderRadius:"12px",cursor:"pointer",textAlign:"left"},
    results:{padding:"1.5rem 1rem",maxWidth:"720px",margin:"0 auto"},
    tabBar:{display:"flex",gap:"0.5rem",marginBottom:"1.25rem",overflowX:"auto",paddingBottom:"2px"},
    tabBtn:{padding:"0.5rem 1rem",borderRadius:"20px",border:"2px solid #e0e0e0",background:"white",cursor:"pointer",fontSize:"0.9rem",fontWeight:500,whiteSpace:"nowrap"},
    tabBtnA:{padding:"0.5rem 1rem",borderRadius:"20px",border:"2px solid #1a237e",background:"#1a237e",color:"white",cursor:"pointer",fontSize:"0.9rem",fontWeight:600,whiteSpace:"nowrap"},
    card:{background:"white",borderRadius:"14px",padding:"1.25rem",marginBottom:"0.75rem",cursor:"pointer",boxShadow:"0 2px 8px rgba(0,0,0,0.06)",transition:"transform 0.15s,box-shadow 0.15s"},
    modal:{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:"1rem"},
    mContent:{background:"white",borderRadius:"16px",padding:"2rem",maxWidth:"560px",width:"100%",maxHeight:"85vh",overflowY:"auto"},
  };

  if (screen==="landing") return (
    <div style={S.app}><div style={S.landing}>
      <div style={{fontSize:"4rem",fontWeight:900,letterSpacing:"0.2em",marginBottom:"0.5rem"}}>ALDA</div>
      <div style={{fontSize:"1.2rem",opacity:0.85,marginBottom:"0.5rem"}}>나에게 딱 맞는 정부 혜택을 찾아드려요</div>
      <div style={{fontSize:"0.9rem",opacity:0.65,marginBottom:"2.5rem"}}>행정안전부 공공서비스 정보 실시간 연동</div>
      {hasSavedProfile && <div style={{background:"rgba(255,255,255,0.12)",borderRadius:"12px",padding:"0.75rem 1.5rem",marginBottom:"1.5rem",fontSize:"0.9rem"}}>💾 저장된 프로필이 있어요</div>}
      <button style={S.startBtn} onClick={handleStart}>내 혜택 찾기 →</button>
      {hasSavedProfile && <button style={S.resumeBtn} onClick={handleContinue}>저장된 프로필로 바로 조회</button>}
      <div style={{marginTop:"2rem",fontSize:"0.85rem",opacity:0.6}}>7가지 질문 · 2,000개 서비스 분석</div>
    </div></div>
  );

  if (screen==="loading") return (
    <div style={S.app}><div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh"}}>
      <div style={{fontSize:"2.5rem",marginBottom:"1rem"}}>🔍</div>
      <div style={{fontSize:"1.2rem",fontWeight:600,color:"#1a237e"}}>맞춤 혜택을 찾는 중...</div>
      <div style={{fontSize:"0.9rem",color:"#888",marginTop:"0.5rem"}}>공공서비스 2,000개 데이터를 분석하고 있어요</div>
    </div></div>
  );

  if (screen==="quiz") {
    const progress=(step/STEPS.length)*100;
    const question=isIncome?`${profile.householdSize||4}인 가구 기준, 월 소득이 얼마예요?`:cur.question;
    return (
      <div style={S.app}><div style={S.quiz}>
        <div style={{width:"100%",maxWidth:"500px",display:"flex",justifyContent:"space-between",marginBottom:"0.5rem"}}>
          <span style={{fontSize:"0.85rem",color:"#888"}}>{step+1} / {STEPS.length}</span>
          <button style={{background:"none",border:"none",color:"#888",cursor:"pointer"}} onClick={()=>setScreen("landing")}>✕</button>
        </div>
        <div style={{width:"100%",maxWidth:"500px",height:"6px",background:"#e0e0e0",borderRadius:"3px",marginBottom:"2rem",overflow:"hidden"}}>
          <div style={{height:"100%",width:progress+"%",background:"linear-gradient(90deg,#1a237e,#3949ab)",borderRadius:"3px",transition:"width 0.3s"}}/>
        </div>
        <div style={S.qCard}>
          <div style={{fontSize:"1.25rem",fontWeight:700,color:"#1a1a2e",marginBottom:isIncome?"0.4rem":"1.5rem"}}>{question}</div>
          {isIncome && <div style={{fontSize:"0.82rem",color:"#888",marginBottom:"1.2rem"}}>세전 월 소득 기준 · 근로·사업·재산 소득 포함</div>}
          {(isIncome?incomeOpts:cur.options).map(opt=>(
            <button key={String(opt.value)} style={isIncome?S.incBtn:S.optBtn} onClick={()=>handleSelect(opt.value)}
              onMouseEnter={e=>{e.currentTarget.style.background="#e8eaf6";e.currentTarget.style.borderColor="#1a237e";}}
              onMouseLeave={e=>{e.currentTarget.style.background="#f5f7fa";e.currentTarget.style.borderColor="transparent";}}>
              {isIncome?(<div><div style={{fontWeight:700,fontSize:"1rem",color:"#1a1a2e"}}>{opt.label}</div><div style={{fontSize:"0.8rem",color:"#888",marginTop:"2px"}}>{opt.sub}</div></div>):opt.label}
            </button>
          ))}
        </div>
        {step>0&&<button style={{marginTop:"1rem",background:"none",border:"none",color:"#888",cursor:"pointer"}} onClick={()=>setStep(step-1)}>← 이전</button>}
      </div></div>
    );
  }
  if (screen==="results") {
    const regionShort=(profile.region||"").replace("특별시","").replace("광역시","").replace("특별자치시","").replace("특별자치도","").replace("도","");
    const TABS=[{id:"list",label:`혜택 목록 (${displayedList.length})`},{id:"saved",label:`내 목록 (${saved.length})`},{id:"timeline",label:"신청 타임라인"},{id:"calculator",label:"수혜액 계산기"}];
    return (
      <div style={S.app}><div style={S.results}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem",flexWrap:"wrap",gap:"0.5rem"}}>
          <div>
            <div style={{fontSize:"1.3rem",fontWeight:700,color:"#1a237e"}}>나에게 맞는 혜택</div>
            <div style={{fontSize:"0.82rem",color:"#888"}}>{profile.age}세 · {regionShort} · 소득{profile.income}%</div>
          </div>
          <div style={{display:"flex",gap:"0.5rem"}}>
            <button style={{padding:"0.4rem 0.9rem",background:"white",color:"#1a237e",border:"2px solid #1a237e",borderRadius:"20px",cursor:"pointer",fontSize:"0.85rem"}} onClick={handleStart}>재검색</button>
            <button style={{padding:"0.4rem 0.9rem",background:"#1a237e",color:"white",border:"none",borderRadius:"20px",cursor:"pointer",fontSize:"0.85rem"}} onClick={()=>setScreen("landing")}>홈</button>
          </div>
        </div>
        <div style={S.tabBar}>
          {TABS.map(t=><button key={t.id} style={tab===t.id?S.tabBtnA:S.tabBtn} onClick={()=>setTab(t.id)}>{t.label}</button>)}
        </div>
        {error&&<div style={{background:"#ffebee",border:"1px solid #f44336",color:"#c62828",padding:"1rem",borderRadius:"8px",marginBottom:"1rem"}}>{error}</div>}

        {tab==="list"&&<>
          <input style={{width:"100%",padding:"0.75rem 1rem",border:"2px solid #e0e0e0",borderRadius:"10px",fontSize:"1rem",marginBottom:"1rem",boxSizing:"border-box"}} placeholder="혜택명, 분야로 검색..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}/>
          {displayedList.length===0?<div style={{textAlign:"center",padding:"3rem",color:"#888"}}><div style={{fontSize:"2rem"}}>😔</div><div>조건에 맞는 혜택을 찾지 못했어요</div></div>
          :displayedList.map((s,i)=>{
            const cat=s["서비스분야"]||"기타"; const col=getColor(cat); const fit=calcFitScore(s,profile);
            const isSv=saved.find(x=>x["서비스ID"]===s["서비스ID"]); const dl=getDeadlineInfo(s);
            return <div key={s["서비스ID"]||i} style={S.card} onClick={()=>handleCardClick(s)}
              onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,0.12)";}}
              onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,0.06)";}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"0.4rem"}}>
                <div style={{display:"flex",alignItems:"center",gap:"0.5rem",flexWrap:"wrap"}}>
                  <span style={{fontSize:"1.2rem"}}>{col.tag}</span>
                  <span style={{fontSize:"0.75rem",fontWeight:600,padding:"2px 8px",borderRadius:"20px",color:"white",background:col.accent}}>{cat}</span>
                  <span style={{fontSize:"0.75rem",fontWeight:600,padding:"2px 8px",borderRadius:"20px",color:"white",background:fit.badgeColor}}>{fit.badge}</span>
                </div>
                <button style={{background:"none",border:"none",fontSize:"1.3rem",cursor:"pointer",color:isSv?"#1a237e":"#ccc"}} onClick={e=>{e.stopPropagation();toggleSave(s);}}>🔖</button>
              </div>
              <div style={{fontSize:"1rem",fontWeight:700,color:"#1a1a2e",marginBottom:"0.3rem"}}>{s["서비스명"]||"서비스명 없음"}</div>
              <div style={{fontSize:"0.88rem",color:"#666",lineHeight:1.5,marginBottom:"0.3rem"}}>{(s["지원내용"]||s["서비스목적요약"]||"").slice(0,80)}{(s["지원내용"]||"").length>80?"...":""}</div>
              {dl&&<div style={{fontSize:"0.78rem",color:"#E65100",fontWeight:600}}>⏰ {dl.label}</div>}
              {fit.warnings.length>0&&<div style={{fontSize:"0.78rem",color:"#FF9800"}}>⚠️ {fit.warnings[0]}</div>}
            </div>;
          })}
        </>}

        {tab==="saved"&&<>
          {saved.length===0?<div style={{textAlign:"center",padding:"3rem",color:"#888"}}><div style={{fontSize:"2rem"}}>🔖</div><div style={{marginTop:"0.5rem"}}>저장된 혜택이 없어요</div><div style={{fontSize:"0.85rem",marginTop:"0.3rem"}}>목록에서 🔖를 눌러 저장하세요</div></div>
          :<>
            <div style={{background:"#e8eaf6",borderRadius:"12px",padding:"0.75rem 1rem",marginBottom:"1rem",fontSize:"0.9rem",color:"#1a237e",fontWeight:600}}>
              신청 완료: {Object.values(checked).filter(Boolean).length} / {saved.length}개
            </div>
            {saved.map((s,i)=>{const id=s["서비스ID"]||String(i);const isC=checked[id];const col=getColor(s["서비스분야"]||"기타");return(
              <div key={id} style={{...S.card,opacity:isC?0.6:1,borderLeft:`4px solid ${isC?"#4CAF50":col.accent}`}} onClick={()=>handleCardClick(s)}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:"0.8rem",color:col.accent,fontWeight:600,marginBottom:"0.2rem"}}>{s["서비스분야"]}</div>
                    <div style={{fontSize:"1rem",fontWeight:700,color:isC?"#aaa":"#1a1a2e",textDecoration:isC?"line-through":"none"}}>{s["서비스명"]}</div>
                  </div>
                  <div style={{display:"flex",gap:"0.5rem",alignItems:"center",marginLeft:"0.75rem"}}>
                    <button style={{padding:"0.4rem 0.8rem",background:isC?"#4CAF50":"#f5f5f5",color:isC?"white":"#555",border:"none",borderRadius:"8px",cursor:"pointer",fontSize:"0.85rem",fontWeight:600}}
                      onClick={e=>{e.stopPropagation();toggleCheck(id);}}>{isC?"✅ 완료":"신청하기"}</button>
                    <button style={{background:"none",border:"none",color:"#ccc",cursor:"pointer"}} onClick={e=>{e.stopPropagation();toggleSave(s);}}>✕</button>
                  </div>
                </div>
              </div>
            );})}
          </>}
        </>}

        {tab==="timeline"&&<>
          <div style={{background:"#e8f5e9",borderRadius:"12px",padding:"0.75rem 1rem",marginBottom:"1rem",fontSize:"0.88rem",color:"#2e7d32"}}>📅 신청 기한이 있는 혜택 · 먼저 확인하세요</div>
          {timelineServices.length===0?<div style={{textAlign:"center",padding:"3rem",color:"#888"}}><div style={{fontSize:"2rem"}}>📅</div><div style={{marginTop:"0.5rem"}}>타임라인 정보가 있는 혜택이 없어요</div></div>
          :timelineServices.map((s,i)=>{const dl=getDeadlineInfo(s);const col=getColor(s["서비스분야"]||"기타");const isSv=saved.find(x=>x["서비스ID"]===s["서비스ID"]);return(
            <div key={s["서비스ID"]||i} style={{display:"flex",gap:"1rem",padding:"1rem",background:"white",borderRadius:"12px",marginBottom:"0.75rem",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
              <div style={{width:"4px",borderRadius:"2px",background:col.accent,flexShrink:0}}/>
              <div style={{flex:1,cursor:"pointer"}} onClick={()=>handleCardClick(s)}>
                <div style={{fontSize:"0.75rem",color:"#E65100",fontWeight:700,marginBottom:"0.2rem"}}>⏰ {dl.label}</div>
                <div style={{fontSize:"1rem",fontWeight:700,color:"#1a1a2e",marginBottom:"0.2rem"}}>{s["서비스명"]}</div>
                <div style={{fontSize:"0.85rem",color:"#666"}}>{(s["지원내용"]||"").slice(0,60)}...</div>
              </div>
              <button style={{background:"none",border:"none",fontSize:"1.3rem",cursor:"pointer",color:isSv?"#1a237e":"#ccc",flexShrink:0}} onClick={()=>toggleSave(s)}>🔖</button>
            </div>
          );})}
        </>}

        {tab==="calculator"&&<div style={{background:"white",borderRadius:"16px",padding:"1.5rem",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
          <div style={{fontSize:"1.1rem",fontWeight:700,color:"#1a237e",marginBottom:"1rem"}}>💰 예상 연간 수혜액</div>
          {saved.length===0?<div style={{textAlign:"center",padding:"2rem",color:"#888"}}>🔖 내 목록에 혜택을 저장하면 예상 수혜액을 계산해드려요</div>
          :<>
            <div style={{background:"linear-gradient(135deg,#1a237e,#3949ab)",borderRadius:"12px",padding:"1.5rem",textAlign:"center",marginBottom:"1.25rem",color:"white"}}>
              <div style={{fontSize:"0.9rem",opacity:0.8,marginBottom:"0.3rem"}}>예상 연간 수혜 총액</div>
              <div style={{fontSize:"2.5rem",fontWeight:900}}>{totalBenefit.toLocaleString()}만원</div>
              <div style={{fontSize:"0.8rem",opacity:0.7,marginTop:"0.3rem"}}>※ 실제 수혜액은 심사 결과에 따라 다를 수 있어요</div>
            </div>
            {saved.map((s,i)=>{const a=parseAmount(s);const col=getColor(s["서비스분야"]||"기타");return(
              <div key={s["서비스ID"]||i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.75rem 0",borderBottom:"1px solid #f0f0f0"}}>
                <div><div style={{fontSize:"0.78rem",color:col.accent,fontWeight:600}}>{s["서비스분야"]}</div><div style={{fontSize:"0.95rem",fontWeight:600,color:"#1a1a2e"}}>{s["서비스명"]}</div></div>
                <div style={{textAlign:"right",marginLeft:"0.5rem"}}>
                  {a?<div style={{fontSize:"0.95rem",fontWeight:700,color:"#1a237e"}}>{a.type==="월"?`월 ${a.amount}만원`:`${a.amount}만원`}</div>:<div style={{fontSize:"0.85rem",color:"#aaa"}}>금액 미공개</div>}
                </div>
              </div>
            );})}
          </>}
        </div>}

        {selectedService&&<div style={S.modal} onClick={e=>{if(e.target===e.currentTarget)setSelectedService(null);}}>
          <div style={S.mContent}>
            <button style={{float:"right",background:"none",border:"none",fontSize:"1.5rem",cursor:"pointer",color:"#666"}} onClick={()=>setSelectedService(null)}>✕</button>
            <div style={{fontSize:"1.25rem",fontWeight:700,color:"#1a237e",marginBottom:"0.75rem",paddingRight:"2rem"}}>{selectedService["서비스명"]}</div>
            <div style={{display:"flex",gap:"0.5rem",marginBottom:"1rem",flexWrap:"wrap"}}>
              {(()=>{const fit=calcFitScore(selectedService,profile);return <span style={{fontSize:"0.8rem",fontWeight:600,padding:"3px 10px",borderRadius:"20px",color:"white",background:fit.badgeColor}}>{fit.badge}</span>;})()}
              <button style={{fontSize:"0.8rem",fontWeight:600,padding:"3px 10px",borderRadius:"20px",border:"none",cursor:"pointer",background:saved.find(x=>x["서비스ID"]===selectedService["서비스ID"])?"#e8eaf6":"#f5f5f5",color:saved.find(x=>x["서비스ID"]===selectedService["서비스ID"])?"#1a237e":"#888"}}
                onClick={()=>toggleSave(selectedService)}>
                {saved.find(x=>x["서비스ID"]===selectedService["서비스ID"])?"🔖 저장됨":"🔖 저장하기"}
              </button>
            </div>
            {detailLoading?<div style={{textAlign:"center",padding:"2rem",color:"#888"}}>상세 정보 불러오는 중...</div>:<>
              {[["분야",selectedService["서비스분야"]],["지원내용",detail?.["지원내용"]||selectedService["지원내용"]],["지원대상",detail?.["지원대상"]||selectedService["지원대상"]],["선정기준",detail?.["선정기준"]||selectedService["선정기준"]],["신청방법",detail?.["신청방법"]||selectedService["신청방법"]],["담당기관",detail?.["소관기관명"]||selectedService["소관기관명"]],["문의",detail?.["전화문의"]||selectedService["전화문의"]]].map(([l,v])=>v?<div key={l} style={{display:"flex",gap:"0.5rem",marginBottom:"0.6rem",fontSize:"0.93rem"}}><span style={{fontWeight:600,color:"#555",minWidth:"70px",flexShrink:0}}>{l}</span><span style={{color:"#333",flex:1,lineHeight:1.6}}>{v}</span></div>:null)}
              {(detail?.["온라인신청사이트URL"]||selectedService["온라인신청사이트URL"])&&<a href={detail?.["온라인신청사이트URL"]||selectedService["온라인신청사이트URL"]} target="_blank" rel="noopener noreferrer" style={{display:"block",width:"100%",padding:"0.9rem",background:"linear-gradient(90deg,#1a237e,#3949ab)",color:"white",border:"none",borderRadius:"10px",fontSize:"1rem",fontWeight:700,cursor:"pointer",marginTop:"1.5rem",textDecoration:"none",textAlign:"center"}}>온라인 신청하기 →</a>}
            </>}
          </div>
        </div>}
      </div></div>
    );
  }
  return null;
          }
