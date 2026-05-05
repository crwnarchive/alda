import { useState, useCallback, useEffect, useRef } from "react";
const API_KEY = import.meta.env.VITE_API_KEY;
const CLAUDE_API = "/api/claude";
const BASE_URL = "https://api.odcloud.kr/api/gov24/v3";
const MEDIAN_INCOME = { 1:239, 2:393, 3:505, 4:613, 5:718, 6:819 };

// ── Claude API 헬퍼 ──────────────────────────────────────
async function claudeChat(system, userMsg, maxTokens = 200) {
  try {
    const res = await fetch(CLAUDE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userMsg }]
      })
    });
    const data = await res.json();
    return data.content?.[0]?.text || null;
  } catch { return null; }
}

async function summarizeBenefit(text) {
  if (!text || text.length < 40) return text;
  const result = await claudeChat(
    "정부 혜택 설명을 한 줄로 요약해. 25자 이내. 금액 있으면 반드시 포함. 존댓말 금지. 핵심만. 예: '만 0세 아동 가정 매월 100만원 지급'",
    text
  );
  return result || text;
}

async function parseProfileFromText(text) {
  const result = await claudeChat(
    `사용자 입력에서 프로필 정보를 추출해서 JSON만 반환해. 다른 텍스트 없이 JSON만.
형식: {"age":숫자,"region":"시도명(예:부산광역시)","pregnant":true/false,"householdSize":숫자,"married":true/false,"house":true/false,"income":"50" or "75" or "100" or "150" or "200+","events":["pregnant","newborn","house","job","education"] 중 해당하는것들}
모르는 값은 null로.`,
    text,
    400
  );
  if (!result) return null;
  try {
    const clean = result.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch { return null; }
}

async function askBenefitBot(serviceName, serviceDetail, question, history) {
  const historyText = history.map(h => `Q: ${h.q}\nA: ${h.a || ""}`).join("\n");
  const result = await claudeChat(
    `당신은 정부 혜택 신청을 도와주는 친근한 도우미예요.
혜택명: ${serviceName}
혜택 정보: ${serviceDetail?.slice(0, 500) || ""}
규칙:
- 3줄 이내로 짧고 명확하게
- 어려운 행정 용어 풀어서 설명
- 신청 방법 물으면 준비물과 신청처 구체적으로
- 모르면 "복지로(1566-0313)에 문의해보세요" 안내
- 이전 대화 흐름 유지${historyText ? "\n이전 대화:\n" + historyText : ""}`,
    question,
    300
  );
  return result || "복지로(1566-0313)에 문의해보세요.";
}

// ── 기존 유틸 함수들 ──────────────────────────────────────
function getIncomeOptions(n){const base=MEDIAN_INCOME[n]||MEDIAN_INCOME[4];return[{value:"30",label:`월 ${Math.round(base*0.3)}만원 이하`,sub:"기초생활수급자 수준"},{value:"50",label:`월 ${Math.round(base*0.5)}만원 이하`,sub:"차상위계층 수준"},{value:"75",label:`월 ${Math.round(base*0.75)}만원 이하`,sub:"중위소득 75%"},{value:"100",label:`월 ${Math.round(base*1.0)}만원 이하`,sub:"중위소득 100%"},{value:"150",label:`월 ${Math.round(base*1.5)}만원 이하`,sub:"중위소득 150%"},{value:"200+",label:`월 ${Math.round(base*1.5)}만원 초과`,sub:"중위소득 150% 초과"}];}
function parseAmount(service){const text=(service["지원내용"]||"")+(service["서비스목적요약"]||"");const m=text.match(/월\s*(\d+[,]?\d*)\s*만원/);const o=text.match(/(\d+[,]?\d*)\s*만원/);if(m)return{type:"월",amount:parseInt(m[1].replace(",",""))};if(o)return{type:"일시",amount:parseInt(o[1].replace(",",""))};return null;}
const DEADLINE_MAP=[{keys:["첫만남","출생"],label:"출생 후 60일 이내"},{keys:["영아수당","아동수당"],label:"출생 후 매월"},{keys:["고위험 임산부"],label:"임신 중 신청"},{keys:["임산부 외래"],label:"임신 중 신청"},{keys:["출산휴가","출산전후"],label:"출산 전후 신청"},{keys:["육아휴직"],label:"복직 전까지"},{keys:["청년도약"],label:"연 1회 모집"}];
function getDeadline(service){const name=service["서비스명"]||"";for(const d of DEADLINE_MAP){if(d.keys.some(k=>name.includes(k)))return d.label;}return null;}
const CATS={"전체":{icon:"✦",color:"#1A1A2E"},"임신·출산":{icon:"🤱",color:"#F06595"},"보육·교육":{icon:"📚",color:"#845EF7"},"주거·자립":{icon:"🏠",color:"#339AF0"},"고용·창업":{icon:"💼",color:"#FD7E14"},"보건·의료":{icon:"💊",color:"#FF6B6B"},"생활안정":{icon:"💚",color:"#51CF66"},"보호·돌봄":{icon:"🤝",color:"#22B8CF"},"문화·환경":{icon:"🎨",color:"#FF6348"},"행정·안전":{icon:"🔒",color:"#868E96"}};
function getCat(cat){for(const k of Object.keys(CATS)){if(cat&&cat.includes(k)&&k!=="전체")return CATS[k];}return{icon:"🏛️",color:"#ADB5BD"};}
function calcFit(service,profile){let score=0;const warnings=[];const txt=(service["지원대상"]||"")+(service["서비스목적요약"]||"");const inc=profile.income?parseInt(profile.income):100;if(txt.includes("임산부")&&!profile.pregnant)return{badge:"해당없음",color:"#DEE2E6"};if(txt.includes("영아")&&!profile.events?.includes("newborn"))return{badge:"해당없음",color:"#DEE2E6"};if(txt.includes("무주택")&&profile.house)return{badge:"해당없음",color:"#DEE2E6"};if(txt.includes("중위소득 50%")&&inc>50)warnings.push("소득 초과 가능");if(txt.includes("중위소득 75%")&&inc>75)warnings.push("소득 초과 가능");if(txt.includes("청년")&&!(profile.age>=19&&profile.age<=34))score-=10;if(txt.includes("장애")&&!profile.disabled)score-=15;if(profile.pregnant&&txt.includes("임신"))score+=30;if(profile.events?.includes("newborn")&&txt.includes("출산"))score+=30;if(!profile.house&&txt.includes("무주택"))score+=20;if(profile.region&&txt.includes(profile.region))score+=10;if(inc<=50&&txt.includes("기초생활"))score+=20;else if(inc<=75&&txt.includes("차상위"))score+=15;if(warnings.length>0&&score<20)return{badge:"확인 필요",color:"#FF9800"};if(score>=35)return{badge:"신청 가능",color:"#00C471"};if(score>=15)return{badge:"검토 추천",color:"#3182F6"};return{badge:"참고",color:"#ADB5BD"};}
const REGIONS=["서울","부산","대구","인천","광주","대전","울산","세종","경기","강원","충북","충남","전북","전남","경북","경남","제주"];
const EVENTS=[{id:"pregnant",icon:"🤱",label:"임신 중",sub:"임신 주수를 알려주세요"},{id:"newborn",icon:"👶",label:"출산 후 1년 이내",sub:"출산 후 몇 개월인지"},{id:"house",icon:"🏠",label:"주택 마련 준비 중",sub:"무주택 여부 확인"},{id:"job",icon:"💼",label:"취업·이직 준비 중",sub:"청년 지원 포함"},{id:"education",icon:"📚",label:"자녀 교육 고민 중",sub:"보육·교육 혜택 확인"}];
async function fetchAllServices(){let all=[],page=1,total=null;while(true){const r=await fetch(`${BASE_URL}/serviceList?serviceKey=${API_KEY}&page=${page}&perPage=100`);const j=await r.json();if(total===null)total=j.totalCount||0;all=[...all,...(j.data||[])];if(all.length>=total||!j.data?.length)break;page++;if(page>5)break;}return all;}
function filterAndSort(raw,p){const filtered=raw.filter(s=>{const cat=s["서비스분야"]||"기타";const txt=(s["지원대상"]||"")+(s["서비스목적요약"]||"");if(p.pregnant&&(cat.includes("임신")||cat.includes("출산")||txt.includes("임산부")))return true;if(p.events?.includes("newborn")&&(txt.includes("출산")||txt.includes("영아")))return true;if(!p.house&&(txt.includes("무주택")||cat.includes("주거")))return true;if(p.events?.includes("job")&&(cat.includes("고용")||txt.includes("취업")||txt.includes("청년")))return true;if(txt.includes("장애")&&!p.disabled)return false;return true;});const pri={"임신·출산":0,"보건·의료":1,"보육·교육":2,"주거·자립":3,"생활안정":4,"보호·돌봄":4,"고용·창업":5,"문화·환경":6,"행정·안전":7};return[...filtered].sort((a,b)=>(pri[a["서비스분야"]]??10)-(pri[b["서비스분야"]]??10));}
const STEPS=[{id:"age",q:"나이가 어떻게 되세요?",type:"age"},{id:"region",q:"거주 지역을 선택해주세요",type:"region"},{id:"events",q:"해당하는 상황을 모두 선택하세요",type:"events"},{id:"income",q:"월 소득 구간을 선택해주세요",type:"income"}];

export default function ALDA(){
const[screen,setScreen]=useState("landing");
const[step,setStep]=useState(0);
const[profile,setProfile]=useState(()=>{try{return JSON.parse(localStorage.getItem("alda_profile"))||{};}catch{return{};}});
const[services,setServices]=useState([]);
const[error,setError]=useState(null);
const[tab,setTab]=useState("list");
const[catFilter,setCatFilter]=useState("전체");
const[saved,setSaved]=useState(()=>{try{return JSON.parse(localStorage.getItem("alda_saved"))||[];}catch{return[];}});
const[checked,setChecked]=useState(()=>{try{return JSON.parse(localStorage.getItem("alda_checked"))||{};}catch{return{};}});
const[modal,setModal]=useState(null);
const[detail,setDetail]=useState(null);
const[detailLoading,setDetailLoading]=useState(false);
const[search,setSearch]=useState("");
const[loadingStep,setLoadingStep]=useState(0);
const[notification,setNotification]=useState(()=>{try{return JSON.parse(localStorage.getItem("alda_notification"))||null;}catch{return null;}});
const[showNotifSheet,setShowNotifSheet]=useState(false);
const[notifEmail,setNotifEmail]=useState("");
const[notifType,setNotifType]=useState("urgent");
const[pregWeek,setPregWeek]=useState(12);
const[newbornMonth,setNewbornMonth]=useState(3);
const[selectedEvents,setSelectedEvents]=useState([]);
const[ageInput,setAgeInput]=useState("");
// ── 신규: AI 자유입력 ──
const[freeText,setFreeText]=useState("");
const[parsing,setParsing]=useState(false);
const[parseError,setParseError]=useState("");
// ── 신규: 요약 캐시 ──
const[summaries,setSummaries]=useState({});
const[summarizing,setSummarizing]=useState({});
// ── 신규: 챗봇 ──
const[botHistory,setBotHistory]=useState([]);
const[botQ,setBotQ]=useState("");
const[botLoading,setBotLoading]=useState(false);

const loadingRef=useRef(null);
const abortRef=useRef(null);

useEffect(()=>{if(Object.keys(profile).length>0)localStorage.setItem("alda_profile",JSON.stringify(profile));},[profile]);
useEffect(()=>{localStorage.setItem("alda_saved",JSON.stringify(saved));},[saved]);
useEffect(()=>{localStorage.setItem("alda_checked",JSON.stringify(checked));},[checked]);
useEffect(()=>{if(notification)localStorage.setItem("alda_notification",JSON.stringify(notification));},[notification]);

// 화면에 보이는 카드 처음 10개 자동 요약
useEffect(()=>{
  if(screen!=="results"||tab!=="list")return;
  displayList.slice(0,10).forEach(async(s)=>{
    const id=s["서비스ID"];
    if(!id||summaries[id]||summarizing[id])return;
    const raw=s["서비스목적요약"]||s["지원내용"]||"";
    if(raw.length<40)return;
    setSummarizing(prev=>({...prev,[id]:true}));
    const result=await summarizeBenefit(raw);
    if(result&&result!==raw){setSummaries(prev=>({...prev,[id]:result}));}
    setSummarizing(prev=>({...prev,[id]:false}));
  });
},[screen,tab,services,catFilter]);

const hasProfile=Object.keys(profile).length>=3;
const runFetch=async(p)=>{setScreen("loading");setLoadingStep(0);setError(null);loadingRef.current=setInterval(()=>setLoadingStep(s=>Math.min(s+1,3)),800);try{const raw=await fetchAllServices();setServices(filterAndSort(raw,p));}catch{setError("데이터를 불러오는 중 오류가 발생했습니다.");}clearInterval(loadingRef.current);setLoadingStep(4);setTimeout(()=>{setScreen("results");setTab("list");setCatFilter("전체");},400);};
const handleSelect=useCallback(async(value)=>{const cur=STEPS[step];let np={...profile,[cur.id]:value};if(cur.id==="events"){np.pregnant=value.includes("pregnant");np.house=!value.includes("house");np.events=value;if(value.includes("pregnant"))np.pregWeek=pregWeek;if(value.includes("newborn"))np.newbornMonth=newbornMonth;}if(cur.id==="age")np.age=parseInt(value);setProfile(np);setTimeout(async()=>{if(step<STEPS.length-1)setStep(step+1);else await runFetch(np);},200);},[step,profile,pregWeek,newbornMonth]);
const toggleSave=(s)=>{const id=s["서비스ID"];setSaved(prev=>prev.find(x=>x["서비스ID"]===id)?prev.filter(x=>x["서비스ID"]!==id):[...prev,s]);};
const toggleCheck=(id)=>{setChecked(prev=>({...prev,[id]:!prev[id]}));};
const openModal=useCallback((service)=>{
  setBotHistory([]);setBotQ("");
  setDetail(null);
  setModal(service);
},[]);

const handleBotSend=async(q)=>{
  if(!q.trim()||botLoading)return;
  setBotQ("");
  const newHistory=[...botHistory,{q,a:null}];
  setBotHistory(newHistory);
  setBotLoading(true);
  const detail_text=(detail?.["지원내용"]||modal?.["지원내용"]||"")+(detail?.["신청방법"]||modal?.["신청방법"]||"");
  const answer=await askBenefitBot(modal?.["서비스명"]||"",detail_text,q,botHistory);
  setBotHistory(prev=>prev.map((item,i)=>i===prev.length-1?{...item,a:answer}:item));
  setBotLoading(false);
};

const handleFreeTextSearch=async()=>{
  if(!freeText.trim()||parsing)return;
  setParseError("");
  setParsing(true);
  const parsed=await parseProfileFromText(freeText);
  setParsing(false);
  if(!parsed){setParseError("입력을 이해하지 못했어요. 좀 더 구체적으로 써주세요.");return;}
  const merged={...profile,...Object.fromEntries(Object.entries(parsed).filter(([,v])=>v!==null))};
  setProfile(merged);
  await runFetch(merged);
};

const totalBenefit=saved.reduce((sum,s)=>{const a=parseAmount(s);if(!a)return sum;return sum+(a.type==="월"?a.amount*12:a.amount);},0);
const displayList=services.filter(s=>{const cat=s["서비스분야"]||"기타";if(catFilter!=="전체"&&!cat.includes(catFilter))return false;if(!search)return true;const q=search.toLowerCase();return(s["서비스명"]||"").toLowerCase().includes(q)||(s["서비스분야"]||"").toLowerCase().includes(q);});
const urgentList=displayList.filter(s=>getDeadline(s)&&getDeadline(s).includes("이내"));
const normalList=displayList.filter(s=>!urgentList.includes(s));
const catCounts={};services.forEach(s=>{const c=s["서비스분야"]||"기타";catCounts[c]=(catCounts[c]||0)+1;});
const availCats=["전체",...Object.keys(CATS).filter(k=>k!=="전체"&&catCounts[k]>0)];
const completedCount=Object.values(checked).filter(Boolean).length;

// ── LANDING ──────────────────────────────────────────────
if(screen==="landing")return(
<div style={{fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif",minHeight:"100vh",background:"#F7F8FA",display:"flex",flexDirection:"column",paddingTop:"env(safe-area-inset-top)"}}>
<div style={{padding:"1.25rem 1.5rem 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
  <div style={{fontSize:"1.1rem",fontWeight:"900",letterSpacing:"0.12em",color:"#1A1A2E"}}>ALDA</div>
  <div style={{fontSize:"0.8rem",color:"#ADB5BD",background:"#EAECF0",padding:"4px 10px",borderRadius:"20px"}}>정부 혜택 가이드</div>
</div>
<div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"2rem 1.5rem 1rem",textAlign:"center"}}>
  <div style={{display:"inline-flex",alignItems:"center",gap:"6px",background:"#EEF2FF",color:"#4C6EF5",fontSize:"0.78rem",fontWeight:600,padding:"6px 14px",borderRadius:"20px",marginBottom:"1.25rem"}}>✦ 행정안전부 공공서비스 실시간 연동</div>
  <h1 style={{fontSize:"clamp(2rem,8vw,3.2rem)",fontWeight:900,color:"#1A1A2E",lineHeight:1.2,marginBottom:"1rem",letterSpacing:"-0.02em"}}>내 상황에 꼭 맞는<br/><span style={{background:"linear-gradient(135deg,#4C6EF5,#845EF7)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>정부 혜택</span>을 찾아드려요</h1>
  <p style={{fontSize:"1rem",color:"#6C757D",marginBottom:"2rem",lineHeight:1.7,maxWidth:"360px"}}>임신·출산·주거·취업, 인생 이벤트마다<br/>더 많은 혜택을 챙기세요</p>

  {/* AI 자유입력 */}
  <div style={{width:"100%",maxWidth:"400px",marginBottom:"1rem"}}>
    <div style={{position:"relative"}}>
      <textarea
        value={freeText}
        onChange={e=>{setFreeText(e.target.value);setParseError("");}}
        onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleFreeTextSearch();}}}
        placeholder="예) 부산 사는 32살 임신 23주차 맞벌이 부부예요"
        rows={2}
        style={{width:"100%",padding:"1rem 1rem 0.75rem",fontSize:"0.95rem",border:"2px solid #E9ECEF",borderRadius:"16px",resize:"none",fontFamily:"inherit",outline:"none",background:"white",boxSizing:"border-box",lineHeight:1.5,transition:"border-color 0.2s"}}
        onFocus={e=>e.target.style.borderColor="#4C6EF5"}
        onBlur={e=>e.target.style.borderColor="#E9ECEF"}
      />
    </div>
    {parseError&&<div style={{fontSize:"0.8rem",color:"#FF3B30",marginTop:"0.4rem",textAlign:"left",paddingLeft:"0.5rem"}}>{parseError}</div>}
    <button
      onClick={handleFreeTextSearch}
      disabled={!freeText.trim()||parsing}
      style={{width:"100%",padding:"1rem",marginTop:"0.5rem",background:freeText.trim()&&!parsing?"linear-gradient(135deg,#4C6EF5,#845EF7)":"#E9ECEF",color:freeText.trim()&&!parsing?"white":"#ADB5BD",border:"none",borderRadius:"14px",fontSize:"1rem",fontWeight:700,cursor:freeText.trim()&&!parsing?"pointer":"default",transition:"all 0.2s"}}>
      {parsing?"✦ AI 분석 중...":"✦ AI로 바로 찾기"}
    </button>
  </div>

  <div style={{display:"flex",alignItems:"center",gap:"10px",width:"100%",maxWidth:"400px",marginBottom:"1rem"}}>
    <div style={{flex:1,height:"1px",background:"#E9ECEF"}}/>
    <span style={{fontSize:"0.78rem",color:"#ADB5BD",flexShrink:0}}>또는 직접 입력</span>
    <div style={{flex:1,height:"1px",background:"#E9ECEF"}}/>
  </div>

  <div style={{background:"linear-gradient(135deg,#1A1A2E,#2D3561)",borderRadius:"16px",padding:"1.5rem",width:"100%",maxWidth:"400px",color:"white",textAlign:"center",marginBottom:"1.25rem"}}>
    <div style={{fontWeight:600,fontSize:"0.85rem",color:"rgba(255,255,255,0.7)",marginBottom:"0.3rem"}}>예상 연간 수혜액 (예시)</div>
    <div style={{fontWeight:900,fontSize:"2rem",letterSpacing:"-0.02em"}}>최대 1,200만원</div>
    <div style={{fontSize:"0.72rem",color:"rgba(255,255,255,0.5)",marginTop:"0.4rem"}}>* 심사 결과에 따라 실제 수혜액은 다를 수 있는 예시입니다</div>
  </div>

  <button onClick={()=>{setScreen("quiz");setStep(0);}} style={{width:"100%",maxWidth:"400px",padding:"1.1rem",fontSize:"1rem",fontWeight:700,background:"white",color:"#4C6EF5",border:"2px solid #E8ECFF",borderRadius:"14px",cursor:"pointer",marginBottom:"0.75rem"}}>단계별로 직접 입력하기 →</button>
  {hasProfile&&(<button onClick={()=>runFetch(profile)} style={{width:"100%",maxWidth:"400px",padding:"1rem",fontSize:"0.95rem",fontWeight:600,background:"#F8F9FA",color:"#6C757D",border:"none",borderRadius:"14px",cursor:"pointer",marginBottom:"2rem"}}>📋 저장된 프로필로 바로 조회</button>)}

  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"0.75rem",maxWidth:"480px",width:"100%",boxSizing:"border-box"}}>
    {[["🤱","임신 중인 부부","최대 800만원 지원 가능"],["🏠","무주택 신혼부부","전세대출 + 특별공급 안내"],["💼","취업 준비 청년","청년도약계좌 + 취업지원 안내"]].map(([n,l,s])=>(
      <div key={l} onClick={()=>{setScreen("quiz");setStep(0);}} style={{background:"white",borderRadius:"14px",padding:"1rem",textAlign:"center",boxShadow:"0 2px 12px rgba(0,0,0,0.06)",cursor:"pointer"}}>
        <div style={{fontSize:"1.5rem",marginBottom:"0.5rem"}}>{n}</div>
        <div style={{fontWeight:700,color:"#1A1A2E",fontSize:"0.8rem",marginBottom:"0.3rem"}}>{l}</div>
        <div style={{fontSize:"0.72rem",color:"#6C757D",lineHeight:1.4}}>{s}</div>
      </div>
    ))}
  </div>
</div>
<div style={{padding:"1rem 1.5rem 2rem",textAlign:"center",fontSize:"0.72rem",color:"#ADB5BD",lineHeight:1.6}}>
  본 서비스는 행정안전부 공공데이터포털의 정보를 활용합니다<br/>
  예상 금액은 참고용이며 실제 수혜액은 심사 결과에 따라 다를 수 있습니다
</div>
</div>);

// ── LOADING ──────────────────────────────────────────────
if(screen==="loading")return(
<div style={{fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif",minHeight:"100vh",background:"#F7F8FA",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",paddingTop:"env(safe-area-inset-top)"}}>
  <div style={{marginBottom:"2rem",fontSize:"1rem",color:"#6C757D"}}>{["프로필 분석 중...","서비스 목록 불러오는 중...","혜택 매칭 중...","결과 정리 중..."][Math.min(loadingStep,3)]}</div>
  <div style={{width:"200px",height:"6px",background:"#E9ECEF",borderRadius:"3px",overflow:"hidden"}}>
    <div style={{height:"100%",width:`${(loadingStep/4)*100}%`,background:"linear-gradient(90deg,#4C6EF5,#845EF7)",borderRadius:"3px",transition:"width 0.4s ease"}}/>
  </div>
</div>);

// ── QUIZ ──────────────────────────────────────────────────
if(screen==="quiz"){const cur=STEPS[step];const progress=(step/STEPS.length)*100;return(
<div style={{fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif",minHeight:"100vh",background:"#F7F8FA",paddingTop:"env(safe-area-inset-top)"}}>
<div style={{padding:"1.25rem 1.5rem",display:"flex",alignItems:"center",gap:"1rem",maxWidth:"520px",margin:"0 auto"}}>
  <button style={{background:"none",border:"none",color:"#ADB5BD",cursor:"pointer",fontSize:"1.2rem",padding:"4px",minHeight:"44px"}} onClick={()=>step>0?setStep(step-1):setScreen("landing")}>←</button>
  <div style={{flex:1,height:"6px",background:"#E9ECEF",borderRadius:"3px",overflow:"hidden"}}><div style={{height:"100%",width:`${progress}%`,background:"linear-gradient(90deg,#4C6EF5,#845EF7)",borderRadius:"3px",transition:"width 0.4s ease"}}/></div>
  <span style={{fontSize:"0.8rem",color:"#ADB5BD",whiteSpace:"nowrap"}}>{step+1}/{STEPS.length}</span>
</div>
<div style={{padding:"1rem 1.5rem 2rem",maxWidth:"520px",margin:"0 auto"}}>
<div style={{marginBottom:"2rem"}}><div style={{fontSize:"clamp(1.2rem,4vw,1.5rem)",fontWeight:800,color:"#1A1A2E",lineHeight:1.4}}>{cur.q}</div></div>
{cur.type==="age"&&(<div><div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"1.5rem"}}><input type="number" value={ageInput} onChange={e=>setAgeInput(e.target.value)} placeholder="예: 28" min="1" max="100" style={{flex:1,padding:"1rem 1.25rem",fontSize:"1.5rem",fontWeight:700,border:"2px solid #E9ECEF",borderRadius:"14px",outline:"none",textAlign:"center"}} onFocus={e=>e.target.style.borderColor="#4C6EF5"} onBlur={e=>e.target.style.borderColor="#E9ECEF"}/><span style={{fontSize:"1rem",color:"#6C757D"}}>세</span></div><button onClick={()=>ageInput&&parseInt(ageInput)>0&&handleSelect(ageInput)} style={{width:"100%",padding:"1rem",fontSize:"1rem",fontWeight:700,background:ageInput&&parseInt(ageInput)>0?"linear-gradient(135deg,#4C6EF5,#845EF7)":"#E9ECEF",color:ageInput&&parseInt(ageInput)>0?"white":"#ADB5BD",border:"none",borderRadius:"14px",cursor:"pointer",minHeight:"44px"}}>다음 →</button></div>)}
{cur.type==="region"&&(<div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"0.5rem"}}>{REGIONS.map(r=>(<button key={r} onClick={()=>handleSelect(r)} style={{padding:"0.9rem 0.25rem",fontSize:"0.9rem",fontWeight:600,background:"white",color:"#1A1A2E",border:"2px solid #E9ECEF",borderRadius:"12px",cursor:"pointer",minHeight:"44px"}}>{r}</button>))}</div>)}
{cur.type==="events"&&(<div>
  <div style={{display:"flex",flexDirection:"column",gap:"0.75rem",marginBottom:"1.5rem"}}>
    {EVENTS.map(ev=>{const selected=selectedEvents.includes(ev.id);return(<button key={ev.id} onClick={()=>setSelectedEvents(prev=>prev.includes(ev.id)?prev.filter(x=>x!==ev.id):[...prev,ev.id])} style={{padding:"1rem 1.25rem",display:"flex",alignItems:"center",gap:"1rem",background:selected?"#EEF2FF":"white",border:`2px solid ${selected?"#4C6EF5":"#E9ECEF"}`,borderRadius:"14px",cursor:"pointer",textAlign:"left",minHeight:"64px"}}><span style={{fontSize:"1.5rem"}}>{ev.icon}</span><div><div style={{fontWeight:700,color:"#1A1A2E",fontSize:"0.95rem"}}>{ev.label}</div><div style={{fontSize:"0.78rem",color:"#6C757D"}}>{ev.sub}</div></div>{selected&&<span style={{marginLeft:"auto",color:"#4C6EF5",fontSize:"1.2rem"}}>✓</span>}</button>);})}
  </div>
  {selectedEvents.includes("pregnant")&&(<div style={{background:"#EEF2FF",borderRadius:"12px",padding:"1rem 1.25rem",marginBottom:"0.75rem"}}><div style={{fontWeight:600,marginBottom:"0.5rem",fontSize:"0.9rem"}}>임신 주수: {pregWeek}주</div><input type="range" min={4} max={40} value={pregWeek} onChange={e=>setPregWeek(parseInt(e.target.value))} style={{width:"100%"}}/></div>)}
  {selectedEvents.includes("newborn")&&(<div style={{background:"#FFF5FB",borderRadius:"12px",padding:"1rem 1.25rem",marginBottom:"0.75rem"}}><div style={{fontWeight:600,marginBottom:"0.75rem",fontSize:"0.9rem"}}>출산 후 몇 개월인가요?</div><div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap"}}>{[1,2,3,4,5,6,7,8,9,10,11,12].map(m=>(<button key={m} onClick={()=>setNewbornMonth(m)} style={{padding:"0.5rem 0.75rem",fontSize:"0.85rem",fontWeight:600,background:newbornMonth===m?"#F06595":"white",color:newbornMonth===m?"white":"#1A1A2E",border:`2px solid ${newbornMonth===m?"#F06595":"#E9ECEF"}`,borderRadius:"8px",cursor:"pointer",minHeight:"44px"}}>{m}개월</button>))}</div></div>)}
  <button onClick={()=>handleSelect(selectedEvents)} style={{width:"100%",padding:"1rem",fontSize:"1rem",fontWeight:700,background:"linear-gradient(135deg,#4C6EF5,#845EF7)",color:"white",border:"none",borderRadius:"14px",cursor:"pointer",minHeight:"44px"}}>{selectedEvents.length>0?`${selectedEvents.length}개 선택 완료 →`:"선택 없이 계속 →"}</button>
</div>)}
{cur.type==="income"&&(<div style={{display:"flex",flexDirection:"column",gap:"0.75rem"}}>{getIncomeOptions(profile.householdSize||4).map((opt,i)=>(<button key={String(opt.value)+i} style={{padding:"1rem 1.25rem",display:"flex",justifyContent:"space-between",alignItems:"center",background:"white",border:"2px solid #E9ECEF",borderRadius:"14px",cursor:"pointer",minHeight:"64px"}} onClick={()=>handleSelect(opt.value)}><div style={{textAlign:"left"}}><div style={{fontWeight:700,color:"#1A1A2E"}}>{opt.label}</div><div style={{fontSize:"0.78rem",color:"#6C757D"}}>{opt.sub}</div></div><span style={{color:"#ADB5BD",fontSize:"1rem"}}>›</span></button>))}</div>)}
</div></div>);}

// ── RESULTS ───────────────────────────────────────────────
return(
<div style={{fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif",minHeight:"100vh",background:"#F7F8FA",paddingTop:"env(safe-area-inset-top)",paddingBottom:"calc(env(safe-area-inset-bottom) + 70px)"}}>
<div style={{position:"sticky",top:0,zIndex:100,background:"white",borderBottom:"1px solid #F1F3F5"}}>
  <div style={{padding:"1rem 1.25rem 0.75rem",maxWidth:"600px",margin:"0 auto"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.5rem"}}>
      <div>
        <div style={{fontSize:"0.78rem",color:"#6C757D",marginBottom:"0.1rem"}}>최대 예상 수혜액</div>
        <div style={{fontSize:"1.6rem",fontWeight:900,color:"#1A1A2E",letterSpacing:"-0.02em"}}>{totalBenefit>0?`${totalBenefit.toLocaleString()}만원`:"저장된 혜택 없음"}</div>
        <div style={{fontSize:"0.72rem",color:"rgba(0,0,0,0.4)",marginTop:"0.2rem"}}>※ 심사 결과에 따라 실제 수혜액은 다를 수 있어요</div>
      </div>
      <div style={{display:"flex",gap:"0.5rem"}}>
        <button onClick={()=>setScreen("quiz")} style={{padding:"0.5rem 0.75rem",background:"#EEF2FF",color:"#4C6EF5",border:"none",borderRadius:"8px",fontSize:"0.78rem",fontWeight:600,cursor:"pointer",minHeight:"44px"}}>재검색</button>
        <button onClick={()=>setScreen("landing")} style={{padding:"0.5rem 0.75rem",background:"#F1F3F5",color:"#6C757D",border:"none",borderRadius:"8px",fontSize:"0.78rem",fontWeight:600,cursor:"pointer",minHeight:"44px"}}>홈</button>
      </div>
    </div>
    <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.5rem"}}>
      <div style={{flex:1,height:"5px",background:"#F1F3F5",borderRadius:"3px",overflow:"hidden"}}>
        <div style={{height:"100%",width:services.length?`${(completedCount/services.length)*100}%`:"0%",background:"linear-gradient(90deg,#4C6EF5,#845EF7)",borderRadius:"3px",transition:"width 0.3s"}}/>
      </div>
      <span style={{fontSize:"0.75rem",color:"#ADB5BD",whiteSpace:"nowrap"}}>신청 완료 {completedCount}/{services.length}개</span>
    </div>
  </div>
  <div style={{display:"flex",padding:"0 1.25rem",gap:"0",overflowX:"auto",scrollbarWidth:"none",maxWidth:"600px",margin:"0 auto"}}>
    {[["list","혜택목록"],["timeline","타임라인"],["saved","내 목록"],["calculator","계산기"]].map(([t,l])=>(<button key={t} onClick={()=>setTab(t)} style={{padding:"0.75rem 1rem",fontSize:"0.88rem",fontWeight:tab===t?700:500,color:tab===t?"#4C6EF5":"#6C757D",background:"none",border:"none",borderBottom:tab===t?"2px solid #4C6EF5":"2px solid transparent",cursor:"pointer",whiteSpace:"nowrap",minHeight:"44px"}}>{l}</button>))}
  </div>
</div>

{/* 알림 배너 */}
{!notification&&(<div onClick={()=>setShowNotifSheet(true)} style={{margin:"0.75rem 1.25rem",background:"#EEF2FF",borderRadius:"12px",padding:"0.875rem 1rem",display:"flex",alignItems:"center",gap:"0.75rem",cursor:"pointer",maxWidth:"600px",boxSizing:"border-box"}}>
  <span style={{fontSize:"1.2rem"}}>📅</span>
  <div style={{flex:1}}><div style={{fontWeight:600,color:"#1A1A2E",fontSize:"0.9rem"}}>마감 알림 설정하면 신청 기한을 놓치지 않아요</div><div style={{fontSize:"0.78rem",color:"#6C757D"}}>이메일로 마감 임박 혜택 알려드려요</div></div>
  <span style={{color:"#4C6EF5",fontSize:"0.8rem"}}>설정 ›</span>
</div>)}
{notification&&(<div style={{margin:"0.75rem 1.25rem",background:"#E6FFF0",borderRadius:"12px",padding:"0.875rem 1rem",display:"flex",alignItems:"center",gap:"0.75rem",maxWidth:"600px",boxSizing:"border-box"}}>
  <span>✅</span><div style={{fontSize:"0.9rem",fontWeight:600,color:"#00C471"}}>알림 설정 완료 ({notification.email})</div>
</div>)}

<div style={{maxWidth:"600px",margin:"0 auto",padding:"0 1.25rem"}}>
{/* 혜택 목록 탭 */}
{tab==="list"&&(<div>
  <div style={{marginBottom:"1rem"}}>
    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 혜택 검색..." style={{width:"100%",padding:"0.85rem 1rem",fontSize:"0.9rem",border:"2px solid #E9ECEF",borderRadius:"12px",outline:"none",background:"white",boxSizing:"border-box"}}/>
  </div>
  <div style={{display:"flex",gap:"0.5rem",overflowX:"auto",scrollbarWidth:"none",marginBottom:"1rem",paddingBottom:"0.25rem"}}>
    {availCats.map(c=>{const cc=getCat(c);return(<button key={c} onClick={()=>setCatFilter(c)} style={{padding:"0.45rem 0.875rem",fontSize:"0.82rem",fontWeight:600,background:catFilter===c?cc.color:"white",color:catFilter===c?"white":cc.color,border:`2px solid ${cc.color}40`,borderRadius:"20px",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,minHeight:"44px"}}>{CATS[c]?.icon||"🏛️"} {c}</button>);})}
  </div>
  {urgentList.length>0&&(<div style={{marginBottom:"1rem"}}>
    <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.5rem"}}>
      <span style={{background:"#FF3B30",color:"white",padding:"2px 8px",borderRadius:"6px",fontSize:"0.72rem",fontWeight:700}}>🔴 긴급</span>
      <span style={{fontSize:"0.8rem",color:"#FF3B30",fontWeight:600}}>마감 임박 혜택</span>
    </div>
    {urgentList.map(s=><ServiceCard key={s["서비스ID"]} s={s} saved={saved} checked={checked} toggleSave={toggleSave} toggleCheck={toggleCheck} openModal={openModal} profile={profile} summary={summaries[s["서비스ID"]]} summarizing={summarizing[s["서비스ID"]]}/>)}
  </div>)}
  {normalList.map(s=><ServiceCard key={s["서비스ID"]} s={s} saved={saved} checked={checked} toggleSave={toggleSave} toggleCheck={toggleCheck} openModal={openModal} profile={profile} summary={summaries[s["서비스ID"]]} summarizing={summarizing[s["서비스ID"]]}/>)}
  {displayList.length===0&&<div style={{textAlign:"center",padding:"3rem",color:"#ADB5BD"}}>해당하는 혜택이 없어요</div>}
</div>)}

{/* 타임라인 탭 */}
{tab==="timeline"&&(<div style={{paddingTop:"1rem"}}>
  {[{id:"job",label:"취업·창업",icon:"💼",highlight:"청년 기간 한정 혜택 놓치지 마세요"},{id:"marriage",label:"결혼",icon:"💍",highlight:"신혼부부 혜택은 혼인 7년 이내"},{id:"house",label:"주택 마련",icon:"🏠",highlight:"무주택 요건 먼저 확인"},{id:"prepare",label:"임신 준비",icon:"🌱",highlight:"난임 지원·엽산제 사전 신청"},{id:"pregnant",label:"임신 중",icon:"🤱",highlight:"임신 초기 신청 필수"},{id:"birth",label:"출산 직후",icon:"👶",highlight:"60일 이내 신청 마감 — 절대 놓치지 마세요"}].map((stage,i)=>{
    const isActive=(profile.pregnant&&stage.id==="pregnant")||(profile.events?.includes("newborn")&&stage.id==="birth")||(profile.events?.includes("house")&&stage.id==="house")||(profile.events?.includes("job")&&stage.id==="job");
    const relatedServices=services.filter(s=>(s["서비스분야"]||"").includes(stage.label));
    const maxBenefit=relatedServices.reduce((m,s)=>{const a=parseAmount(s);return a?Math.max(m,a.amount):m;},0);
    return(<div key={stage.id} style={{display:"flex",gap:"1rem",marginBottom:"0.5rem"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",width:"32px",flexShrink:0}}>
        <div style={{width:"32px",height:"32px",borderRadius:"50%",background:isActive?"#4C6EF5":"white",border:`3px solid ${isActive?"#4C6EF5":"#DEE2E6"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1rem"}}>{isActive?"●":"○"}</div>
        {i<5&&<div style={{flex:1,width:"2px",background:"#DEE2E6",margin:"4px 0",minHeight:"40px"}}/>}
      </div>
      <div style={{flex:1,background:"white",borderRadius:"14px",padding:"1rem",marginBottom:"1rem",border:isActive?"2px solid #4C6EF5":"2px solid transparent",boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
        <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.5rem"}}>
          <span style={{fontSize:"1.25rem"}}>{stage.icon}</span>
          <span style={{fontWeight:700,fontSize:"1rem",color:"#1A1A2E"}}>{stage.label}</span>
          {isActive&&<span style={{background:"#4C6EF5",color:"white",padding:"2px 8px",borderRadius:"6px",fontSize:"0.7rem",fontWeight:700,marginLeft:"auto"}}>현재</span>}
        </div>
        {maxBenefit>0&&<div style={{fontSize:"0.85rem",color:"#4C6EF5",fontWeight:700,marginBottom:"0.5rem"}}>최대 {maxBenefit.toLocaleString()}만원 지원</div>}
        <div style={{background:"#FFF4E6",borderRadius:"8px",padding:"0.5rem 0.75rem",fontSize:"0.78rem",color:"#E67700",fontWeight:600}}>⚠️ {stage.highlight}</div>
      </div>
    </div>);})}
</div>)}

{/* 내 목록 탭 */}
{tab==="saved"&&(<div style={{paddingTop:"1rem"}}>
  {saved.length===0?(<div style={{textAlign:"center",padding:"3rem 1rem",color:"#ADB5BD"}}><div style={{fontSize:"2rem",marginBottom:"1rem"}}>🔖</div><div style={{fontWeight:600}}>저장된 혜택이 없어요</div></div>):(saved.map(s=><ServiceCard key={s["서비스ID"]} s={s} saved={saved} checked={checked} toggleSave={toggleSave} toggleCheck={toggleCheck} openModal={openModal} profile={profile} summary={summaries[s["서비스ID"]]} summarizing={summarizing[s["서비스ID"]]}/>))}
</div>)}

{/* 계산기 탭 */}
{tab==="calculator"&&(<div style={{paddingTop:"1rem"}}>
  <div style={{background:"linear-gradient(135deg,#1A1A2E,#2D3561)",borderRadius:"20px",padding:"2rem",color:"white",marginBottom:"1.5rem",textAlign:"center"}}>
    <div style={{fontSize:"0.9rem",color:"rgba(255,255,255,0.7)",marginBottom:"0.5rem"}}>저장 혜택 연간 예상 총액</div>
    <div style={{fontSize:"2.5rem",fontWeight:900,letterSpacing:"-0.02em"}}>{totalBenefit.toLocaleString()}만원</div>
    <div style={{fontSize:"0.72rem",color:"rgba(255,255,255,0.5)",marginTop:"0.75rem"}}>※ 심사 결과에 따라 실제 수혜액은 다를 수 있으며, 예상 금액은 참고용입니다</div>
  </div>
  {saved.length===0&&<div style={{textAlign:"center",padding:"2rem",color:"#ADB5BD",fontSize:"0.9rem"}}>🔖 혜택을 저장하면 예상 수혜액을 계산해드려요</div>}
  {saved.map(s=>{const a=parseAmount(s);return a?(<div key={s["서비스ID"]} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.875rem 0",borderBottom:"1px solid #F1F3F5"}}><div style={{fontSize:"0.9rem",color:"#1A1A2E",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginRight:"1rem"}}>{s["서비스명"]}</div><div style={{fontWeight:700,color:"#4C6EF5",flexShrink:0}}>{a.type==="월"?`연 ${(a.amount*12).toLocaleString()}만원`:`${a.amount.toLocaleString()}만원`}</div></div>):null;})}
  <button onClick={()=>{
  const count = saved.length;
  const amount = totalBenefit;
  let text = "";
  if(amount > 0){
    text = `🇰🇷 정부 혜택 ${count}개 발견!\n연간 최대 ${amount.toLocaleString()}만원 받을 수 있어요 (예상)\n\n나도 모르던 정부 지원금, 알다에서 1분만에 찾았어요 👇\nalda-xi.vercel.app`;
  } else {
    text = `🇰🇷 나한테 맞는 정부 혜택, 알다에서 찾아봤어요\n임신·출산·주거·취업 혜택을 1분만에 확인해보세요 👇\nalda-xi.vercel.app`;
  }
  if(navigator.share){
    navigator.share({title:"알다 - 정부혜택 찾기", text}).catch(()=>{});
  } else {
    const encoded = encodeURIComponent(text);
    window.open(`https://sharer.kakao.com/talk/friends/picker/link?text=${encoded}`);
  }
}} style={{width:"100%",padding:"1rem",fontSize:"1rem",fontWeight:700,background:"#FEE500",color:"#1A1A2E",border:"none",borderRadius:"14px",cursor:"pointer",marginTop:"1.5rem",minHeight:"44px"}}>💬 카카오톡으로 공유하기</button>
</div>)}
</div>

{/* 하단 네비게이션 */}
<div style={{position:"fixed",bottom:0,left:0,right:0,background:"white",borderTop:"1px solid #F1F3F5",paddingBottom:"env(safe-area-inset-bottom)",zIndex:100}}>
  <div style={{display:"flex",maxWidth:"600px",margin:"0 auto"}}>
    {[["홈","🏠","landing"],["혜택목록","🎁","list"],["타임라인","📅","timeline"],["내목록","🔖","saved"]].map(([l,ic,t])=>(
      <button key={l} onClick={()=>t==="landing"?setScreen("landing"):setTab(t)} style={{flex:1,padding:"0.75rem 0",display:"flex",flexDirection:"column",alignItems:"center",gap:"0.2rem",background:"none",border:"none",cursor:"pointer",minHeight:"56px"}}>
        <span style={{fontSize:"1.25rem"}}>{ic}</span>
        <span style={{fontSize:"0.68rem",fontWeight:600,color:(t==="landing"&&screen==="landing")||(t===tab&&screen!=="landing")?"#4C6EF5":"#6C757D"}}>{l}</span>
      </button>
    ))}
  </div>
</div>

{/* 알림 설정 시트 */}
{showNotifSheet&&(
<div style={{position:"fixed",inset:0,zIndex:200,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
  <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.4)"}} onClick={()=>setShowNotifSheet(false)}/>
  <div style={{position:"relative",background:"white",borderRadius:"20px 20px 0 0",padding:"1.5rem 1.5rem calc(env(safe-area-inset-bottom) + 1.5rem)"}}>
    <div style={{fontWeight:800,fontSize:"1.1rem",marginBottom:"1.25rem"}}>📅 마감 알림 설정</div>
    <input value={notifEmail} onChange={e=>setNotifEmail(e.target.value)} placeholder="이메일 주소 입력" type="email" style={{width:"100%",padding:"0.875rem",fontSize:"1rem",border:"2px solid #E9ECEF",borderRadius:"12px",outline:"none",marginBottom:"1rem",boxSizing:"border-box"}}/>
    <div style={{display:"flex",gap:"0.75rem",marginBottom:"1.25rem"}}>
      {[["urgent","🔴 긴급 혜택만"],["all","📋 전체 혜택"]].map(([v,l])=>(<button key={v} onClick={()=>setNotifType(v)} style={{flex:1,padding:"0.75rem",fontSize:"0.9rem",fontWeight:600,background:notifType===v?"#EEF2FF":"white",color:notifType===v?"#4C6EF5":"#6C757D",border:`2px solid ${notifType===v?"#4C6EF5":"#E9ECEF"}`,borderRadius:"12px",cursor:"pointer",minHeight:"44px"}}>{l}</button>))}
    </div>
    <button onClick={()=>{if(!notifEmail)return;setNotification({email:notifEmail,type:notifType});setShowNotifSheet(false);}} style={{width:"100%",padding:"1rem",fontSize:"1rem",fontWeight:700,background:"linear-gradient(135deg,#4C6EF5,#845EF7)",color:"white",border:"none",borderRadius:"14px",cursor:"pointer",minHeight:"44px"}}>알림 설정 완료</button>
  </div>
</div>)}

{/* 혜택 상세 모달 */}
{modal&&(
<div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>{if(e.target===e.currentTarget){setModal(null);setBotHistory([]);}}}>
  <div style={{background:"white",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:"600px",maxHeight:"92vh",overflowY:"auto",padding:"0 0 2rem"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"1.25rem 1.5rem",borderBottom:"1px solid #F1F3F5",position:"sticky",top:0,background:"white",zIndex:1}}>
      <div style={{fontWeight:800,fontSize:"1rem",flex:1,marginRight:"1rem",lineHeight:1.3}}>{modal["서비스명"]}</div>
      <button onClick={()=>{setModal(null);setBotHistory([]);}} style={{background:"none",border:"none",fontSize:"1.5rem",cursor:"pointer",color:"#ADB5BD",padding:"4px",minWidth:"44px",minHeight:"44px",flexShrink:0}}>×</button>
    </div>
    <div style={{padding:"1.25rem 1.5rem"}}>
      (<>
        {(()=>{const cc=getCat(modal["서비스분야"]||"기타");const fit=calcFit(modal,profile);const amt=parseAmount(modal);return(<div style={{marginBottom:"1rem"}}><div style={{display:"flex",gap:"0.5rem",marginBottom:"0.75rem",flexWrap:"wrap"}}><span style={{fontWeight:700,padding:"3px 10px",borderRadius:"20px",color:"white",background:cc.color,fontSize:"0.78rem"}}>{cc.icon} {(modal["서비스분야"]||"").split("·")[0]}</span><span style={{fontWeight:700,padding:"3px 10px",borderRadius:"20px",color:"white",background:fit.color,fontSize:"0.78rem"}}>{fit.badge}</span></div>{amt&&<div style={{fontWeight:900,color:"#4C6EF5",fontSize:"1.3rem",marginBottom:"0.5rem"}}>{amt.type==="월"?`월 ${amt.amount.toLocaleString()}만원`:`${amt.amount.toLocaleString()}만원`}</div>}{modal["서비스목적요약"]&&<div style={{fontSize:"0.9rem",color:"#6C757D",lineHeight:1.6,marginBottom:"0.5rem"}}>{modal["서비스목적요약"]}</div>}</div>);})()}
        {[["지원내용",modal["지원내용"]],["지원대상",modal["지원대상"]],["선정기준",modal["선정기준"]],["신청방법",modal["신청방법"]],["담당기관",modal["소관기관명"]],["문의",modal["전화문의"]]].map(([l,v])=>v?(<div key={l} style={{marginBottom:"1rem",paddingBottom:"1rem",borderBottom:"1px solid #F8F9FA"}}><div style={{fontWeight:700,color:"#ADB5BD",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:"0.3rem",fontSize:"0.72rem"}}>{l}</div><div style={{color:"#343A40",lineHeight:1.7,fontSize:"0.9rem"}}>{v}</div></div>):null)}

        {/* ── 신청 도우미 챗봇 ── */}
        <div style={{background:"#F7F8FA",borderRadius:"16px",padding:"1rem 1.25rem",marginBottom:"1rem"}}>
          <div style={{fontSize:"0.78rem",fontWeight:700,color:"#ADB5BD",marginBottom:"0.75rem",letterSpacing:"0.05em"}}>✦ 신청 도우미</div>
          {botHistory.length===0&&(
            <div style={{display:"flex",flexWrap:"wrap",gap:"6px",marginBottom:"0.75rem"}}>
              {["어떻게 신청해요?","준비물이 뭐예요?","얼마나 걸려요?","온라인으로 되나요?"].map(q=>(
                <button key={q} onClick={()=>handleBotSend(q)} style={{padding:"6px 12px",background:"white",border:"1.5px solid #E9ECEF",borderRadius:"20px",fontSize:"0.78rem",cursor:"pointer",color:"#495057",fontFamily:"inherit",minHeight:"36px"}}>{q}</button>
              ))}
            </div>
          )}
          <div style={{display:"flex",flexDirection:"column",gap:"8px",marginBottom:botHistory.length>0?"0.75rem":"0"}}>
            {botHistory.map((item,i)=>(
              <div key={i}>
                <div style={{display:"flex",justifyContent:"flex-end",marginBottom:"4px"}}>
                  <div style={{background:"#4C6EF5",color:"white",borderRadius:"16px 16px 4px 16px",padding:"8px 12px",fontSize:"0.85rem",maxWidth:"80%",lineHeight:1.5}}>{item.q}</div>
                </div>
                {item.a&&<div style={{background:"white",border:"1px solid #E9ECEF",borderRadius:"4px 16px 16px 16px",padding:"8px 12px",fontSize:"0.85rem",color:"#343A40",lineHeight:1.6,maxWidth:"90%"}}>{item.a}</div>}
                {!item.a&&botLoading&&i===botHistory.length-1&&<div style={{fontSize:"0.82rem",color:"#ADB5BD",padding:"4px 0"}}>답변 생성 중...</div>}
              </div>
            ))}
          </div>
          {botHistory.length>0&&(
            <div style={{display:"flex",gap:"6px",marginTop:"0.5rem"}}>
              <input
                value={botQ}
                onChange={e=>setBotQ(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&botQ.trim())handleBotSend(botQ);}}
                placeholder="더 궁금한 점을 물어보세요"
                style={{flex:1,padding:"8px 12px",border:"1.5px solid #E9ECEF",borderRadius:"10px",fontSize:"0.85rem",outline:"none",fontFamily:"inherit"}}
              />
              <button onClick={()=>handleBotSend(botQ)} disabled={!botQ.trim()||botLoading} style={{padding:"8px 14px",background:botQ.trim()&&!botLoading?"#4C6EF5":"#E9ECEF",color:botQ.trim()&&!botLoading?"white":"#ADB5BD",border:"none",borderRadius:"10px",fontSize:"0.85rem",fontWeight:600,cursor:botQ.trim()&&!botLoading?"pointer":"default",minHeight:"44px"}}>전송</button>
            </div>
          )}
        </div>

        <a href={modal["온라인신청URL"]||"https://www.gov.kr/portal/service/serviceList"} target="_blank" rel="noopener noreferrer" style={{display:"block",padding:"1rem",background:"linear-gradient(135deg,#4C6EF5,#845EF7)",color:"white",border:"none",borderRadius:"14px",fontSize:"1rem",fontWeight:700,cursor:"pointer",textAlign:"center",textDecoration:"none",marginBottom:"0.75rem"}}>온라인 신청하기 →</a>
        <button onClick={()=>toggleSave(modal)} style={{width:"100%",padding:"0.875rem",fontSize:"0.95rem",fontWeight:600,background:saved.find(x=>x["서비스ID"]===modal["서비스ID"])?"#EEF2FF":"#F8F9FA",color:saved.find(x=>x["서비스ID"]===modal["서비스ID"])?"#4C6EF5":"#6C757D",border:"none",borderRadius:"14px",cursor:"pointer",minHeight:"44px"}}>{saved.find(x=>x["서비스ID"]===modal["서비스ID"])?"🔖 저장됨":"🔖 저장하기"}</button>
      </>)
    </div>
  </div>
</div>)}
</div>);}

function ServiceCard({s,saved,checked,toggleSave,toggleCheck,openModal,profile,summary,summarizing}){
  const cc=getCat(s["서비스분야"]||"기타");
  const a=parseAmount(s);
  const deadline=getDeadline(s);
  const fit=calcFit(s,profile);
  const isSaved=saved.find(x=>x["서비스ID"]===s["서비스ID"]);
  const isChecked=checked[s["서비스ID"]];
  const displayDesc=summary||(s["서비스목적요약"]||"");
  return(
  <div onClick={()=>openModal(s)} style={{background:"white",borderRadius:"16px",padding:"1.25rem",marginBottom:"0.75rem",boxShadow:"0 2px 12px rgba(0,0,0,0.06)",cursor:"pointer",position:"relative",opacity:isChecked?0.6:1,transition:"transform 0.15s"}} onTouchStart={e=>{e.currentTarget.style.transform="scale(0.98)";}} onTouchEnd={e=>{e.currentTarget.style.transform="";}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"0.75rem"}}>
      <div style={{flex:1,marginRight:"0.75rem"}}>
        <div style={{display:"flex",alignItems:"center",gap:"0.4rem",marginBottom:"0.4rem",flexWrap:"wrap"}}>
          <span style={{fontWeight:700,padding:"2px 8px",borderRadius:"12px",color:"white",background:cc.color,fontSize:"0.72rem"}}>{cc.icon} {(s["서비스분야"]||"기타").split("·")[0]}</span>
          {deadline&&<span style={{fontWeight:700,padding:"2px 8px",borderRadius:"12px",background:"#FFF4E6",color:"#E67700",fontSize:"0.72rem"}}>📅 {deadline}</span>}
          <span style={{fontWeight:700,padding:"2px 8px",borderRadius:"12px",background:fit.color+"20",color:fit.color,fontSize:"0.72rem"}}>{fit.badge}</span>
        </div>
        <div style={{fontWeight:700,color:"#1A1A2E",fontSize:"0.95rem",lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{s["서비스명"]}</div>
      </div>
      <button onClick={e=>{e.stopPropagation();toggleSave(s);}} style={{background:"none",border:"none",fontSize:"1.3rem",cursor:"pointer",padding:"4px",minWidth:"44px",minHeight:"44px",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{isSaved?"🔖":"🏷️"}</button>
    </div>
    {a&&<div style={{fontWeight:800,color:"#4C6EF5",fontSize:"1.05rem",marginBottom:"0.5rem"}}>{a.type==="월"?`월 ${a.amount.toLocaleString()}만원`:`${a.amount.toLocaleString()}만원`}</div>}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div style={{fontSize:"0.78rem",color:summarizing?"#ADB5BD":"#6C757D",lineHeight:1.4,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginRight:"0.5rem",fontStyle:summarizing?"italic":"normal"}}>
        {summarizing?"✦ AI 요약 중...":displayDesc}
      </div>
      <label onClick={e=>e.stopPropagation()} style={{display:"flex",alignItems:"center",gap:"0.35rem",cursor:"pointer",flexShrink:0,minHeight:"44px"}}>
        <input type="checkbox" checked={!!isChecked} onChange={()=>toggleCheck(s["서비스ID"])} style={{width:"18px",height:"18px",accentColor:"#4C6EF5"}}/>
        <span style={{fontSize:"0.75rem",color:"#6C757D"}}>완료</span>
      </label>
    </div>
  </div>);}
