import { useState, useCallback } from "react";

const API_KEY = import.meta.env.VITE_API_KEY;
const BASE_URL = "https://api.odcloud.kr/api/gov24/v3";

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
  { id: "married", label: "결혼", question: "결혼 여부를 알려주세요", type: "bool",
    options: [{ value: true, label: "기혼 / 사실혼" }, { value: false, label: "미혼" }],
  },
  { id: "pregnant", label: "임신·출산", question: "임신 중이거나 출산 예정인가요?", type: "bool",
    options: [{ value: true, label: "해당돼요" }, { value: false, label: "해당 없어요" }],
  },
  { id: "house", label: "주택", question: "내 집이 있나요?", type: "bool",
    options: [{ value: true, label: "자가 소유" }, { value: false, label: "무주택 / 전월세" }],
  },
  { id: "income", label: "소득", question: "가구 소득 수준은?", type: "select",
    options: [
      { value: "30", label: "중위소득 30% 이하" }, { value: "50", label: "중위소득 50% 이하" },
      { value: "75", label: "중위소득 75% 이하" }, { value: "100", label: "중위소득 100% 이하" },
      { value: "150", label: "중위소득 150% 이하" }, { value: "200+", label: "중위소득 150% 초과" },
    ],
  },
];

const CATEGORY_COLORS = {
  "임신·출산": { bg: "#e8f4fd", accent: "#2196F3", tag: "🤱" },
  "보육·교육": { bg: "#fce4ec", accent: "#E91E63", tag: "📚" },
  "주거·토지": { bg: "#e8f5e9", accent: "#4CAF50", tag: "🏠" },
  "일자리": { bg: "#fff3e0", accent: "#FF9800", tag: "💼" },
  "복지·돌봄": { bg: "#f3e5f5", accent: "#9C27B0", tag: "🤝" },
  "금융": { bg: "#e3f2fd", accent: "#1976D2", tag: "💰" },
  "문화·여가": { bg: "#fbe9e7", accent: "#FF5722", tag: "🎭" },
  "기타": { bg: "#f5f5f5", accent: "#607D8B", tag: "📋" },
};

function getColor(category) {
  for (const key of Object.keys(CATEGORY_COLORS)) {
    if (category && category.includes(key)) return CATEGORY_COLORS[key];
  }
  return CATEGORY_COLORS["기타"];
}

async function fetchServices(profile) {
  try {
    const params = new URLSearchParams({ serviceKey: API_KEY, page: 1, perPage: 100 });
    if (profile.region) params.append("조회조건_시도명칭", profile.region);
    const res = await fetch(BASE_URL + "/serviceList?" + params.toString());
    if (!res.ok) throw new Error("API error " + res.status);
    const json = await res.json();
    return json.data || [];
  } catch (e) {
    console.error(e);
    return [];
  }
}

async function fetchDetail(serviceId) {
  try {
    const params = new URLSearchParams({ serviceKey: API_KEY, serviceId });
    const res = await fetch(BASE_URL + "/serviceDetail?" + params.toString());
    if (!res.ok) throw new Error("API error " + res.status);
    const json = await res.json();
    return json.data?.[0] || null;
  } catch (e) {
    console.error(e);
    return null;
  }
}

function filterByProfile(services, profile) {
  return services.filter((s) => {
    const combined = ((s["서비스명"] || "") + (s["서비스분야"] || "") + (s["지원대상"] || "") + (s["선정기준"] || "")).toLowerCase();
    if (profile.pregnant === true) {
      const ageRanges = { "0-2": [0,2], "3-6": [3,6], "7-12": [7,12], "13-18": [13,18], "19-24": [19,24], "25-34": [25,34], "35-44": [35,44], "45-54": [45,54], "55-64": [55,64], "65-74": [65,74], "75+": [75,120] };
      const range = ageRanges[profile.age] || [0,120];
      if (!combined.includes("임신") && !combined.includes("출산") && !combined.includes("산모") && !combined.includes("신생아") && range[0] > 5) return false;
    }
    return true;
  });
}

const styles = {
  app: { fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif", minHeight: "100vh", background: "#f8f9fa" },
  landing: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "linear-gradient(135deg,#1a237e 0%,#283593 50%,#3949ab 100%)", color: "white", padding: "2rem", textAlign: "center" },
  startBtn: { padding: "1rem 3rem", fontSize: "1.1rem", fontWeight: 700, background: "white", color: "#1a237e", border: "none", borderRadius: "50px", cursor: "pointer", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" },
  quiz: { display: "flex", flexDirection: "column", alignItems: "center", minHeight: "100vh", padding: "2rem 1rem", background: "#f8f9fa" },
  questionCard: { background: "white", borderRadius: "16px", padding: "2rem", maxWidth: "500px", width: "100%", boxShadow: "0 2px 12px rgba(0,0,0,0.08)" },
  optionBtn: { display: "block", width: "100%", padding: "0.85rem 1.25rem", marginBottom: "0.75rem", background: "#f5f7fa", border: "2px solid transparent", borderRadius: "10px", cursor: "pointer", fontSize: "1rem", fontWeight: 500, textAlign: "left" },
  results: { padding: "1.5rem 1rem", maxWidth: "700px", margin: "0 auto" },
  card: { background: "white", borderRadius: "14px", padding: "1.25rem", marginBottom: "0.75rem", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  modal: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" },
  modalContent: { background: "white", borderRadius: "16px", padding: "2rem", maxWidth: "560px", width: "100%", maxHeight: "85vh", overflowY: "auto" },
};

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
        const raw = await fetchServices(newProfile);
        const filtered = filterByProfile(raw, newProfile);
        setServices(filtered);
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
    if (serviceId) setDetail(await fetchDetail(serviceId));
    setDetailLoading(false);
  }, []);

  const filtered = services.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (s["서비스명"] || "").toLowerCase().includes(q) || (s["서비스분야"] || "").toLowerCase().includes(q);
  });

  if (screen === "landing") return (
    <div style={styles.app}>
      <div style={styles.landing}>
        <div style={{ fontSize: "4rem", fontWeight: 900, letterSpacing: "0.2em", marginBottom: "0.5rem" }}>ALDA</div>
        <div style={{ fontSize: "1.2rem", opacity: 0.85, marginBottom: "0.75rem" }}>나에게 딱 맞는 정부 혜택을 찾아드려요</div>
        <div style={{ fontSize: "0.9rem", opacity: 0.65, marginBottom: "2.5rem" }}>행정안전부 공공서비스 정보 실시간 연동</div>
        <button style={styles.startBtn} onClick={handleStart}>내 혜택 찾기 →</button>
        <div style={{ marginTop: "2rem", fontSize: "0.85rem", opacity: 0.6 }}>6가지 질문으로 맞춤 혜택을 추천해 드려요</div>
      </div>
    </div>
  );

  if (screen === "loading") return (
    <div style={styles.app}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🔍</div>
        <div style={{ fontSize: "1.2rem", fontWeight: 600, color: "#1a237e" }}>맞춤 혜택을 찾는 중...</div>
        <div style={{ fontSize: "0.9rem", color: "#888", marginTop: "0.5rem" }}>공공서비스 데이터를 불러오고 있어요</div>
      </div>
    </div>
  );

  if (screen === "quiz") {
    const cur = STEPS[step];
    const progress = (step / STEPS.length) * 100;
    return (
      <div style={styles.app}>
        <div style={styles.quiz}>
          <div style={{ width: "100%", maxWidth: "500px", display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.85rem", color: "#888" }}>{step + 1} / {STEPS.length}</span>
            <button style={{ background: "none", border: "none", color: "#888", cursor: "pointer" }} onClick={() => setScreen("landing")}>✕</button>
          </div>
          <div style={{ width: "100%", maxWidth: "500px", height: "6px", background: "#e0e0e0", borderRadius: "3px", marginBottom: "2rem", overflow: "hidden" }}>
            <div style={{ height: "100%", width: progress + "%", background: "linear-gradient(90deg,#1a237e,#3949ab)", borderRadius: "3px", transition: "width 0.3s" }} />
          </div>
          <div style={styles.questionCard}>
            <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#1a1a2e", marginBottom: "1.5rem" }}>{cur.question}</div>
            {cur.options.map((opt) => (
              <button key={String(opt.value)} style={styles.optionBtn} onClick={() => handleSelect(opt.value)}
                onMouseEnter={e => { e.target.style.background = "#e8eaf6"; e.target.style.borderColor = "#1a237e"; }}
                onMouseLeave={e => { e.target.style.background = "#f5f7fa"; e.target.style.borderColor = "transparent"; }}>
                {opt.label}
              </button>
            ))}
          </div>
          {step > 0 && <button style={{ marginTop: "1rem", background: "none", border: "none", color: "#888", cursor: "pointer" }} onClick={() => setStep(step - 1)}>← 이전</button>}
        </div>
      </div>
    );
  }

  if (screen === "results") return (
    <div style={styles.app}>
      <div style={styles.results}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#1a237e" }}>나에게 맞는 혜택</div>
            <div style={{ fontSize: "0.85rem", color: "#888" }}>{filtered.length}개 서비스 발견</div>
          </div>
          <button style={{ padding: "0.5rem 1.2rem", background: "#1a237e", color: "white", border: "none", borderRadius: "20px", cursor: "pointer" }} onClick={handleStart}>다시 검색</button>
        </div>
        {error && <div style={{ background: "#ffebee", border: "1px solid #f44336", color: "#c62828", padding: "1rem", borderRadius: "8px", marginBottom: "1rem" }}>{error}</div>}
        <input style={{ width: "100%", padding: "0.75rem 1rem", border: "2px solid #e0e0e0", borderRadius: "10px", fontSize: "1rem", marginBottom: "1rem", boxSizing: "border-box" }}
          placeholder="혜택명, 분야로 검색..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#888" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>😔</div>
            <div>조건에 맞는 혜택을 찾지 못했어요</div>
            <button style={{ padding: "0.5rem 1.2rem", background: "#1a237e", color: "white", border: "none", borderRadius: "20px", cursor: "pointer", marginTop: "1rem" }} onClick={handleStart}>다시 검색</button>
          </div>
        ) : filtered.map((s, i) => {
          const cat = s["서비스분야"] || "기타";
          const col = getColor(cat);
          return (
            <div key={s["서비스ID"] || i} style={styles.card} onClick={() => handleCardClick(s)}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.12)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "1.3rem" }}>{col.tag}</span>
                <span style={{ fontSize: "0.8rem", fontWeight: 600, padding: "2px 8px", borderRadius: "20px", color: "white", background: col.accent }}>{cat}</span>
              </div>
              <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "#1a1a2e", marginBottom: "0.4rem" }}>{s["서비스명"] || "서비스명 없음"}</div>
              <div style={{ fontSize: "0.9rem", color: "#666", lineHeight: 1.5 }}>{(s["지원내용"] || s["서비스목적"] || "").slice(0, 80)}{(s["지원내용"] || "").length > 80 ? "..." : ""}</div>
              {s["지원금액(회차별)"] && <div style={{ marginTop: "0.5rem", fontSize: "0.9rem", fontWeight: 600, color: col.accent }}>{s["지원금액(회차별)"]}</div>}
            </div>
          );
        })}
      </div>
      {selectedService && (
        <div style={styles.modal} onClick={e => { if (e.target === e.currentTarget) setSelectedService(null); }}>
          <div style={styles.modalContent}>
            <button style={{ float: "right", background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "#666" }} onClick={() => setSelectedService(null)}>✕</button>
            <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#1a237e", marginBottom: "1rem", paddingRight: "2rem" }}>{selectedService["서비스명"]}</div>
            {detailLoading ? (
              <div style={{ textAlign: "center", padding: "2rem", color: "#888" }}>상세 정보 불러오는 중...</div>
            ) : (
              <>
                {[["분야", selectedService["서비스분야"]], ["지원내용", detail?.["지원내용"] || selectedService["지원내용"]], ["지원대상", detail?.["지원대상"] || selectedService["지원대상"]], ["선정기준", detail?.["선정기준"] || selectedService["선정기준"]], ["지원금액", detail?.["지원금액(회차별)"] || selectedService["지원금액(회차별)"]], ["신청방법", detail?.["신청방법"] || selectedService["신청방법"]], ["담당기관", detail?.["소관기관명"] || selectedService["소관기관명"]], ["문의처", detail?.["문의처"] || selectedService["문의처"]]].map(([label, value]) =>
                  value ? (
                    <div key={label} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.6rem", fontSize: "0.95rem" }}>
                      <span style={{ fontWeight: 600, color: "#555", minWidth: "70px" }}>{label}</span>
                      <span style={{ color: "#333", flex: 1 }}>{value}</span>
                    </div>
                  ) : null
                )}
                {(detail?.["온라인신청URL"] || selectedService["온라인신청URL"]) && (
                  <a href={detail?.["온라인신청URL"] || selectedService["온라인신청URL"]} target="_blank" rel="noopener noreferrer"
                    style={{ display: "block", width: "100%", padding: "0.9rem", background: "linear-gradient(90deg,#1a237e,#3949ab)", color: "white", border: "none", borderRadius: "10px", fontSize: "1rem", fontWeight: 700, cursor: "pointer", marginTop: "1.5rem", textDecoration: "none", textAlign: "center" }}>
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
