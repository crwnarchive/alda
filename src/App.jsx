import { useState, useCallback } from "react";

const API_KEY = import.meta.env.VITE_API_KEY;
const BASE_URL = "https://api.odcloud.kr/api/gov24/v3";

// 2025년 기준 중위소득 (만원/월, 가구원 수별)
const MEDIAN_INCOME = {
  1: 239, 2: 393, 3: 505, 4: 613, 5: 718, 6: 819,
};

function getIncomeOptions(householdSize) {
  const base = MEDIAN_INCOME[householdSize] || MEDIAN_INCOME[4];
  return [
    { value: "30", label: `월 ${Math.round(base * 0.3)}만원 이하`, sub: "중위소득 30% (기초생활수급자 수준)" },
    { value: "50", label: `월 ${Math.round(base * 0.5)}만원 이하`, sub: "중위소득 50% (차상위계층 수준)" },
    { value: "75", label: `월 ${Math.round(base * 0.75)}만원 이하`, sub: "중위소득 75%" },
    { value: "100", label: `월 ${Math.round(base * 1.0)}만원 이하`, sub: "중위소득 100% (중간 소득 수준)" },
    { value: "150", label: `월 ${Math.round(base * 1.5)}만원 이하`, sub: "중위소득 150%" },
    { value: "200+", label: `월 ${Math.round(base * 1.5)}만원 초과`, sub: "중위소득 150% 초과" },
  ];
}

const HOUSEHOLD_OPTIONS = [1,2,3,4,5,6].map(n => ({ value: n, label: `${n}인 가구` }));

const STEPS = [
  { id: "age", label: "나이", question: "만 나이가 어떻게 되세요?", type: "select",
    options: [
      { value: "0-2", label: "만 0~2세" }, { value: "3-6", label: "만 3~6세" },
      { value: "7-12", label: "만 7~12세" }, { value: "13-18", label: "만 13~18세" },
      { value: "19-24", label: "만 19~24세" }, { value: "25-34", label: "만 25~34세" },
      { value: "35-44", label: "만 35~44세" }, { value: "45-54", label: "만 45~54세" },
      { value: "55-64", label: "만 55~64세" }, { value: "65-74", label: "만 65~74세" },
      { value: "75+", label: "만 75세 이상" },
    ],
  },
  { id: "region", label: "지역", question: "현재 거주하시는 지역은?", type: "select",
    options: [
      { value: "서울특별시", label: "서울" }, { value: "부산광역시", label: "부산" },
      { value: "대구광역시", label: "대구" }, { value: "인천광역시", label: "인천" },
      { value: "광주광역시", label: "광주" }, { value: "대전광역시", label: "대전" },
      { value: "울산광역시", label: "울산" }, { value: "세종특별자치시", label: "세종" },
      { value: "경기도", label: "경기" }, { value: "강원특별자치도", label: "강원" },
      { value: "충청북도", label: "충북" }, { value: "충청남도", label: "충남" },
      { value: "전북특별자치도", label: "전북" }, { value: "전라남도", label: "전남" },
      { value: "경상북도", label: "경북" }, { value: "경상남도", label: "경남" },
      { value: "제주특별자치도", label: "제주" },
    ],
  },
  { id: "householdSize", label: "가구", question: "가구원 수가 어떻게 되세요?", type: "select",
    options: HOUSEHOLD_OPTIONS,
  },
  { id: "married", label: "결혼", question: "결혼 여부를 알려주세요", type: "bool",
    options: [{ value: true, label: "기혼 / 사실혼" }, { value: false, label: "미혼" }],
  },
  { id: "pregnant", label: "임신·출산", question: "임신 중이거나 출산 후 1년 이내인가요?", type: "bool",
    options: [{ value: true, label: "해당돼요" }, { value: false, label: "해당 없어요" }],
  },
  { id: "house", label: "주택", question: "내 집이 있나요?", type: "bool",
    options: [{ value: true, label: "자가 소유" }, { value: false, label: "무주택 / 전월세" }],
  },
  { id: "income", label: "소득", question: null, type: "income" },
];

const CATEGORY_COLORS = {
  "임신·출산": { accent: "#E91E63", tag: "🤱" },
  "보육·교육": { accent: "#9C27B0", tag: "📚" },
  "주거·자립": { accent: "#2196F3", tag: "🏠" },
  "고용·창업": { accent: "#FF9800", tag: "💼" },
  "보건·의료": { accent: "#F44336", tag: "🏥" },
  "생활안정": { accent: "#4CAF50", tag: "💚" },
  "보호·돌봄": { accent: "#00BCD4", tag: "🤝" },
  "문화·환경": { accent: "#FF5722", tag: "🎭" },
  "행정·안전": { accent: "#607D8B", tag: "🔒" },
  "농림축산어업": { accent: "#8BC34A", tag: "🌾" },
  "기타": { accent: "#9E9E9E", tag: "📋" },
};

function getColor(category) {
  for (const key of Object.keys(CATEGORY_COLORS)) {
    if (category && category.includes(key)) return CATEGORY_COLORS[key];
  }
  return CATEGORY_COLORS["기타"];
}

// 전체 10,936개에서 여러 페이지 병렬 조회 후 프로필에 맞게 필터링
async function fetchAllServices(profile) {
  const PAGES = 20; // 최대 2000개 조회
  const promises = [];
  for (let page = 1; page <= PAGES; page++) {
    const params = new URLSearchParams({ serviceKey: API_KEY, page, perPage: 100 });
    promises.push(
      fetch(BASE_URL + "/serviceList?" + params.toString())
        .then(r => r.ok ? r.json() : { data: [] })
        .then(j => j.data || [])
        .catch(() => [])
    );
  }
  const results = await Promise.all(promises);
  return results.flat();
}

function filterByProfile(services, profile) {
  const incomeNum = parseInt(profile.income) || 200;
  const ageRange = getAgeRange(profile.age);

  return services.filter((s) => {
    const name = s["서비스명"] || "";
    const cat = s["서비스분야"] || "";
    const target = s["지원대상"] || "";
    const criteria = s["선정기준"] || "";
    const combined = (name + cat + target + criteria).toLowerCase();

    // 농림축산어업 제외 (일반 사용자 무관)
    if (cat === "농림축산어업") return false;

    // 임신·출산 분야 우선 표시 (임신 선택 시)
    if (profile.pregnant === true) {
      if (cat === "임신·출산") return true;
    }

    // 소득 조건 필터: "고소득" 대상이지만 저소득 사용자인 경우 제외
    if (incomeNum <= 75) {
      if (combined.includes("고소득") && !combined.includes("저소득")) return false;
    }

    // 무주택 여부
    if (profile.house === false) {
      if (combined.includes("자가") && combined.includes("소유")) return false;
    }

    return true;
  });
}

function getAgeRange(ageVal) {
  const map = {
    "0-2": [0,2], "3-6": [3,6], "7-12": [7,12], "13-18": [13,18],
    "19-24": [19,24], "25-34": [25,34], "35-44": [35,44],
    "45-54": [45,54], "55-64": [55,64], "65-74": [65,74], "75+": [75,120],
  };
  return map[ageVal] || [0,120];
}

// 분야별로 정렬 (임신·출산 관련 먼저, 농림 제외)
function sortByRelevance(services, profile) {
  const priority = {
    "임신·출산": profile.pregnant ? 0 : 5,
    "보건·의료": 1,
    "보육·교육": 2,
    "주거·자립": 3,
    "생활안정": 4,
    "보호·돌봄": 4,
    "고용·창업": 5,
    "문화·환경": 6,
    "행정·안전": 7,
  };
  return [...services].sort((a, b) => {
    const pa = priority[a["서비스분야"]] ?? 10;
    const pb = priority[b["서비스분야"]] ?? 10;
    return pa - pb;
  });
}

export default function ALDA() {
  const [screen, setScreen] = useState("landing");
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState({});
  const [services, setServices] = useState([]);
  const [error, setError] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleStart = () => { setScreen("quiz"); setStep(0); setProfile({}); setServices([]); setError(null); };

  const handleSelect = useCallback(async (value) => {
    const currentStep = STEPS[step];
    const newProfile = { ...profile, [currentStep.id]: value };
    setProfile(newProfile);
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      setScreen("loading");
      try {
        const raw = await fetchAllServices(newProfile);
        const filtered = filterByProfile(raw, newProfile);
        const sorted = sortByRelevance(filtered, newProfile);
        setServices(sorted);
      } catch {
        setError("데이터를 불러오는 중 오류가 발생했습니다.");
      }
      setScreen("results");
    }
  }, [step, profile]);

  const handleCardClick = useCallback(async (service) => {
    setSelectedService(service);
    setDetail(null);
    setDetailLoading(true);
    const serviceId = service["서비스ID"];
    if (serviceId) {
      try {
        const res = await fetch(BASE_URL + "/serviceDetail?serviceKey=" + API_KEY + "&serviceId=" + serviceId);
        const json = await res.json();
        setDetail(json.data?.[0] || null);
      } catch { /* ignore */ }
    }
    setDetailLoading(false);
  }, []);

  const currentStepData = STEPS[step];
  const isIncomeStep = currentStepData?.type === "income";
  const incomeOptions = isIncomeStep ? getIncomeOptions(profile.householdSize || 4) : [];

  const displayedServices = services.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (s["서비스명"]||"").toLowerCase().includes(q) || (s["서비스분야"]||"").toLowerCase().includes(q) || (s["지원내용"]||"").toLowerCase().includes(q);
  });

  const S = {
    app: { fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif", minHeight: "100vh", background: "#f8f9fa" },
    landing: { display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"100vh", background:"linear-gradient(135deg,#1a237e 0%,#283593 50%,#3949ab 100%)", color:"white", padding:"2rem", textAlign:"center" },
    startBtn: { padding:"1rem 3rem", fontSize:"1.1rem", fontWeight:700, background:"white", color:"#1a237e", border:"none", borderRadius:"50px", cursor:"pointer", boxShadow:"0 4px 20px rgba(0,0,0,0.3)" },
    quiz: { display:"flex", flexDirection:"column", alignItems:"center", minHeight:"100vh", padding:"2rem 1rem", background:"#f8f9fa" },
    qCard: { background:"white", borderRadius:"16px", padding:"2rem", maxWidth:"500px", width:"100%", boxShadow:"0 2px 12px rgba(0,0,0,0.08)" },
    optBtn: { display:"block", width:"100%", padding:"0.85rem 1.25rem", marginBottom:"0.75rem", background:"#f5f7fa", border:"2px solid transparent", borderRadius:"10px", cursor:"pointer", fontSize:"1rem", fontWeight:500, textAlign:"left" },
    incomeBtn: { display:"block", width:"100%", padding:"0.9rem 1.25rem", marginBottom:"0.75rem", background:"#f5f7fa", border:"2px solid transparent", borderRadius:"12px", cursor:"pointer", textAlign:"left" },
    results: { padding:"1.5rem 1rem", maxWidth:"700px", margin:"0 auto" },
    card: { background:"white", borderRadius:"14px", padding:"1.25rem", marginBottom:"0.75rem", cursor:"pointer", boxShadow:"0 2px 8px rgba(0,0,0,0.06)", transition:"transform 0.15s, box-shadow 0.15s" },
    modal: { position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:"1rem" },
    mContent: { background:"white", borderRadius:"16px", padding:"2rem", maxWidth:"560px", width:"100%", maxHeight:"85vh", overflowY:"auto" },
  };

  if (screen === "landing") return (
    <div style={S.app}>
      <div style={S.landing}>
        <div style={{fontSize:"4rem",fontWeight:900,letterSpacing:"0.2em",marginBottom:"0.5rem"}}>ALDA</div>
        <div style={{fontSize:"1.2rem",opacity:0.85,marginBottom:"0.75rem"}}>나에게 딱 맞는 정부 혜택을 찾아드려요</div>
        <div style={{fontSize:"0.9rem",opacity:0.65,marginBottom:"2.5rem"}}>행정안전부 공공서비스 정보 실시간 연동</div>
        <button style={S.startBtn} onClick={handleStart}>내 혜택 찾기 →</button>
        <div style={{marginTop:"2rem",fontSize:"0.85rem",opacity:0.6}}>6가지 질문으로 맞춤 혜택을 추천해 드려요</div>
      </div>
    </div>
  );

  if (screen === "loading") return (
    <div style={S.app}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh"}}>
        <div style={{fontSize:"2.5rem",marginBottom:"1rem"}}>🔍</div>
        <div style={{fontSize:"1.2rem",fontWeight:600,color:"#1a237e"}}>맞춤 혜택을 찾는 중...</div>
        <div style={{fontSize:"0.9rem",color:"#888",marginTop:"0.5rem"}}>공공서비스 2,000개 데이터를 분석하고 있어요</div>
      </div>
    </div>
  );

  if (screen === "quiz") {
    const cur = STEPS[step];
    const progress = (step / STEPS.length) * 100;
    const question = isIncomeStep
      ? `${profile.householdSize || 4}인 가구 기준, 월 소득이 얼마예요?`
      : cur.question;

    return (
      <div style={S.app}>
        <div style={S.quiz}>
          <div style={{width:"100%",maxWidth:"500px",display:"flex",justifyContent:"space-between",marginBottom:"0.5rem"}}>
            <span style={{fontSize:"0.85rem",color:"#888"}}>{step+1} / {STEPS.length}</span>
            <button style={{background:"none",border:"none",color:"#888",cursor:"pointer"}} onClick={()=>setScreen("landing")}>✕</button>
          </div>
          <div style={{width:"100%",maxWidth:"500px",height:"6px",background:"#e0e0e0",borderRadius:"3px",marginBottom:"2rem",overflow:"hidden"}}>
            <div style={{height:"100%",width:progress+"%",background:"linear-gradient(90deg,#1a237e,#3949ab)",borderRadius:"3px",transition:"width 0.3s"}}/>
          </div>
          <div style={S.qCard}>
            <div style={{fontSize:"1.25rem",fontWeight:700,color:"#1a1a2e",marginBottom:"0.4rem"}}>{question}</div>
            {isIncomeStep && (
              <div style={{fontSize:"0.82rem",color:"#888",marginBottom:"1.2rem"}}>
                ※ 세전 월 소득 기준 / 근로·사업·재산 소득 포함
              </div>
            )}
            {(isIncomeStep ? incomeOptions : cur.options).map((opt) => (
              <button
                key={String(opt.value)}
                style={isIncomeStep ? S.incomeBtn : S.optBtn}
                onClick={() => handleSelect(opt.value)}
                onMouseEnter={e=>{e.currentTarget.style.background="#e8eaf6";e.currentTarget.style.borderColor="#1a237e";}}
                onMouseLeave={e=>{e.currentTarget.style.background="#f5f7fa";e.currentTarget.style.borderColor="transparent";}}
              >
                {isIncomeStep ? (
                  <div>
                    <div style={{fontWeight:700,fontSize:"1rem",color:"#1a1a2e"}}>{opt.label}</div>
                    <div style={{fontSize:"0.8rem",color:"#888",marginTop:"2px"}}>{opt.sub}</div>
                  </div>
                ) : opt.label}
              </button>
            ))}
          </div>
          {step > 0 && <button style={{marginTop:"1rem",background:"none",border:"none",color:"#888",cursor:"pointer"}} onClick={()=>setStep(step-1)}>← 이전</button>}
        </div>
      </div>
    );
  }

  if (screen === "results") return (
    <div style={S.app}>
      <div style={S.results}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem",flexWrap:"wrap",gap:"0.5rem"}}>
          <div>
            <div style={{fontSize:"1.3rem",fontWeight:700,color:"#1a237e"}}>나에게 맞는 혜택</div>
            <div style={{fontSize:"0.85rem",color:"#888"}}>{displayedServices.length}개 서비스 발견</div>
          </div>
          <button style={{padding:"0.5rem 1.2rem",background:"#1a237e",color:"white",border:"none",borderRadius:"20px",cursor:"pointer"}} onClick={handleStart}>다시 검색</button>
        </div>
        {error && <div style={{background:"#ffebee",border:"1px solid #f44336",color:"#c62828",padding:"1rem",borderRadius:"8px",marginBottom:"1rem"}}>{error}</div>}
        <input
          style={{width:"100%",padding:"0.75rem 1rem",border:"2px solid #e0e0e0",borderRadius:"10px",fontSize:"1rem",marginBottom:"1rem",boxSizing:"border-box"}}
          placeholder="혜택명, 분야로 검색..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
        />
        {displayedServices.length === 0 ? (
          <div style={{textAlign:"center",padding:"3rem 1rem",color:"#888"}}>
            <div style={{fontSize:"2rem",marginBottom:"0.5rem"}}>😔</div>
            <div>조건에 맞는 혜택을 찾지 못했어요</div>
            <button style={{padding:"0.5rem 1.2rem",background:"#1a237e",color:"white",border:"none",borderRadius:"20px",cursor:"pointer",marginTop:"1rem"}} onClick={handleStart}>다시 검색</button>
          </div>
        ) : displayedServices.map((s,i)=>{
          const cat = s["서비스분야"]||"기타";
          const col = getColor(cat);
          return (
            <div key={s["서비스ID"]||i} style={S.card} onClick={()=>handleCardClick(s)}
              onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,0.12)";}}
              onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,0.06)";}}>
              <div style={{display:"flex",alignItems:"center",gap:"0.75rem",marginBottom:"0.5rem"}}>
                <span style={{fontSize:"1.3rem"}}>{col.tag}</span>
                <span style={{fontSize:"0.8rem",fontWeight:600,padding:"2px 8px",borderRadius:"20px",color:"white",background:col.accent}}>{cat}</span>
              </div>
              <div style={{fontSize:"1.05rem",fontWeight:700,color:"#1a1a2e",marginBottom:"0.4rem"}}>{s["서비스명"]||"서비스명 없음"}</div>
              <div style={{fontSize:"0.9rem",color:"#666",lineHeight:1.5}}>{(s["지원내용"]||s["서비스목적요약"]||"").slice(0,80)}{((s["지원내용"]||"").length>80?"...":"")}</div>
              {s["지원유형"] && <div style={{marginTop:"0.5rem",fontSize:"0.8rem",color:col.accent,fontWeight:600}}>{s["지원유형"]}</div>}
            </div>
          );
        })}
      </div>
      {selectedService && (
        <div style={S.modal} onClick={e=>{if(e.target===e.currentTarget)setSelectedService(null);}}>
          <div style={S.mContent}>
            <button style={{float:"right",background:"none",border:"none",fontSize:"1.5rem",cursor:"pointer",color:"#666"}} onClick={()=>setSelectedService(null)}>✕</button>
            <div style={{fontSize:"1.3rem",fontWeight:700,color:"#1a237e",marginBottom:"1rem",paddingRight:"2rem"}}>{selectedService["서비스명"]}</div>
            {detailLoading ? (
              <div style={{textAlign:"center",padding:"2rem",color:"#888"}}>상세 정보 불러오는 중...</div>
            ) : (
              <>
                {[
                  ["분야", selectedService["서비스분야"]],
                  ["지원내용", detail?.["지원내용"]||selectedService["지원내용"]],
                  ["지원대상", detail?.["지원대상"]||selectedService["지원대상"]],
                  ["선정기준", detail?.["선정기준"]||selectedService["선정기준"]],
                  ["신청방법", detail?.["신청방법"]||selectedService["신청방법"]],
                  ["담당기관", detail?.["소관기관명"]||selectedService["소관기관명"]],
                  ["문의", detail?.["전화문의"]||selectedService["전화문의"]],
                ].map(([label,value])=>value?(
                  <div key={label} style={{display:"flex",gap:"0.5rem",marginBottom:"0.6rem",fontSize:"0.95rem"}}>
                    <span style={{fontWeight:600,color:"#555",minWidth:"70px",flexShrink:0}}>{label}</span>
                    <span style={{color:"#333",flex:1,lineHeight:1.6}}>{value}</span>
                  </div>
                ):null)}
                {(detail?.["온라인신청사이트URL"]||selectedService["온라인신청사이트URL"]) && (
                  <a href={detail?.["온라인신청사이트URL"]||selectedService["온라인신청사이트URL"]} target="_blank" rel="noopener noreferrer"
                    style={{display:"block",width:"100%",padding:"0.9rem",background:"linear-gradient(90deg,#1a237e,#3949ab)",color:"white",border:"none",borderRadius:"10px",fontSize:"1rem",fontWeight:700,cursor:"pointer",marginTop:"1.5rem",textDecoration:"none",textAlign:"center"}}>
                    온라인 신청하기 →
                  </a>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return null;
}
