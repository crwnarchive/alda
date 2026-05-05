import { useState } from "react";

const BENEFITS = [
  {
    id: 1,
    name: "첫만남이용권",
    category: "임신·출산",
    amount: "200만원",
    desc: "출생 아동 1인당 바우처 지급",
    conditions: { pregnant: true },
    tag: "🍼",
    color: "#e8f4fd",
    accent: "#2196F3",
  },
  {
    id: 2,
    name: "부모급여",
    category: "임신·출산",
    amount: "월 100만원",
    desc: "만 0세 아동 양육 가정 매월 지급",
    conditions: { pregnant: true },
    tag: "👶",
    color: "#fce4ec",
    accent: "#E91E63",
  },
  {
    id: 3,
    name: "임신·출산 진료비 지원",
    category: "임신·출산",
    amount: "최대 100만원",
    desc: "국민행복카드로 임신·출산 의료비 지원",
    conditions: { pregnant: true },
    tag: "🏥",
    color: "#e8f5e9",
    accent: "#4CAF50",
  },
  {
    id: 4,
    name: "주거급여",
    category: "주거",
    amount: "월 최대 50만원",
    desc: "소득 기준 충족 시 임차료 또는 수선비 지원",
    conditions: { income: ["~100만원", "100~200만원"], house: "무주택" },
    tag: "🏠",
    color: "#fff3e0",
    accent: "#FF9800",
  },
  {
    id: 5,
    name: "청년 전세대출",
    category: "주거",
    amount: "최대 3억원",
    desc: "만 34세 이하 무주택 청년 저금리 전세자금 대출",
    conditions: { ageMax: 34, house: "무주택" },
    tag: "🔑",
    color: "#ede7f6",
    accent: "#7E57C2",
  },
  {
    id: 6,
    name: "신혼부부 특별공급",
    category: "주거",
    amount: "분양가 우선권",
    desc: "혼인 7년 이내 신혼부부 공공주택 우선 분양",
    conditions: { married: true, house: "무주택" },
    tag: "💒",
    color: "#fce4ec",
    accent: "#F06292",
  },
  {
    id: 7,
    name: "근로장려금",
    category: "소득지원",
    amount: "최대 330만원",
    desc: "저소득 근로자 및 사업자 세금 환급 방식 지원",
    conditions: { income: ["~100만원", "100~200만원", "200~300만원"] },
    tag: "💰",
    color: "#e8f5e9",
    accent: "#43A047",
  },
  {
    id: 8,
    name: "자녀장려금",
    category: "소득지원",
    amount: "자녀 1인당 100만원",
    desc: "18세 미만 부양자녀 보유 저소득 가구 지원",
    conditions: { pregnant: true, income: ["~100만원", "100~200만원", "200~300만원"] },
    tag: "🌟",
    color: "#fff9c4",
    accent: "#F9A825",
  },
  {
    id: 9,
    name: "에너지바우처",
    category: "생활지원",
    amount: "연 최대 30만원",
    desc: "취약계층 냉난방비 지원 바우처",
    conditions: { income: ["~100만원"] },
    tag: "⚡",
    color: "#fff3e0",
    accent: "#EF6C00",
  },
  {
    id: 10,
    name: "의료급여",
    category: "의료",
    amount: "의료비 90% 지원",
    desc: "소득 기준 충족 시 병원비 대부분 국가 부담",
    conditions: { income: ["~100만원", "100~200만원"] },
    tag: "💊",
    color: "#e3f2fd",
    accent: "#1976D2",
  },
  {
    id: 11,
    name: "국민취업지원제도",
    category: "취업·창업",
    amount: "월 50만원 × 6개월",
    desc: "취업 취약계층 구직촉진수당 + 취업지원 서비스",
    conditions: { income: ["~100만원", "100~200만원"] },
    tag: "💼",
    color: "#e8eaf6",
    accent: "#3949AB",
  },
  {
    id: 12,
    name: "결혼·출산 지자체 지원금",
    category: "임신·출산",
    amount: "지역별 상이",
    desc: "거주 지역 지자체 결혼·출산 축하금 별도 지급",
    conditions: { married: true },
    tag: "🎊",
    color: "#f3e5f5",
    accent: "#9C27B0",
  },
];

const STEPS = [
  { id: "age", label: "나이", icon: "🎂" },
  { id: "region", label: "거주 지역", icon: "📍" },
  { id: "married", label: "결혼 여부", icon: "💍" },
  { id: "pregnant", label: "임신 여부", icon: "🤰" },
  { id: "house", label: "주택 소유", icon: "🏡" },
  { id: "income", label: "월 소득", icon: "💵" },
];

const REGIONS = [
  "서울", "경기", "인천", "부산", "대구", "광주", "대전", "울산", "세종",
  "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];

const INCOME_OPTIONS = [
  "~100만원", "100~200만원", "200~300만원", "300~500만원", "500만원 이상",
];

function matchBenefits(profile) {
  return BENEFITS.filter((b) => {
    const c = b.conditions;
    if (c.pregnant && !profile.pregnant) return false;
    if (c.married && !profile.married) return false;
    if (c.house && c.house !== profile.house) return false;
    if (c.ageMax && profile.age > c.ageMax) return false;
    if (c.income && !c.income.includes(profile.income)) return false;
    return true;
  });
}

export default function ALDA() {
  const [step, setStep] = useState(-1);
  const [profile, setProfile] = useState({
    age: "",
    region: "",
    married: null,
    pregnant: null,
    house: "",
    income: "",
  });
  const [results, setResults] = useState(null);
  const [selectedBenefit, setSelectedBenefit] = useState(null);

  const currentStep = STEPS[step];

  const isStepComplete = () => {
    if (!currentStep) return false;
    const val = profile[currentStep.id];
    return val !== "" && val !== null && val !== undefined;
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      const matched = matchBenefits(profile);
      setResults(matched);
      setStep(STEPS.length);
    }
  };

  const handleRestart = () => {
    setStep(-1);
    setProfile({ age: "", region: "", married: null, pregnant: null, house: "", income: "" });
    setResults(null);
    setSelectedBenefit(null);
  };

  const styles = {
    root: {
      minHeight: "100vh",
      background: "#f7f8fa",
      fontFamily: "'Pretendard', 'Apple SD Gothic Neo', sans-serif",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-start",
    },
    nav: {
      width: "100%",
      maxWidth: 480,
      padding: "20px 24px 0",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    },
    logo: {
      fontSize: 22,
      fontWeight: 800,
      color: "#111",
      letterSpacing: "-0.5px",
    },
    logoAccent: { color: "#3182f6" },
    card: {
      width: "100%",
      maxWidth: 480,
      margin: "0 auto",
      padding: "0 16px",
      flex: 1,
    },
    landingWrap: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "60px 24px 40px",
      textAlign: "center",
    },
    badge: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      background: "#e8f1ff",
      color: "#3182f6",
      fontSize: 13,
      fontWeight: 600,
      padding: "6px 14px",
      borderRadius: 100,
      marginBottom: 28,
    },
    landingTitle: {
      fontSize: 32,
      fontWeight: 800,
      color: "#111",
      lineHeight: 1.3,
      marginBottom: 16,
      letterSpacing: "-0.8px",
    },
    landingDesc: {
      fontSize: 16,
      color: "#666",
      lineHeight: 1.7,
      marginBottom: 40,
    },
    ctaBtn: {
      width: "100%",
      maxWidth: 360,
      padding: "18px 0",
      background: "#3182f6",
      color: "#fff",
      fontSize: 17,
      fontWeight: 700,
      border: "none",
      borderRadius: 14,
      cursor: "pointer",
      letterSpacing: "-0.3px",
      boxShadow: "0 4px 20px rgba(49,130,246,0.35)",
      transition: "transform 0.1s, box-shadow 0.1s",
    },
    statsRow: {
      display: "flex",
      gap: 12,
      marginTop: 48,
      width: "100%",
      maxWidth: 360,
    },
    statBox: {
      flex: 1,
      background: "#fff",
      borderRadius: 14,
      padding: "16px 12px",
      textAlign: "center",
      boxShadow: "0 1px 8px rgba(0,0,0,0.06)",
    },
    statNum: { fontSize: 20, fontWeight: 800, color: "#111", letterSpacing: "-0.5px" },
    statLabel: { fontSize: 12, color: "#888", marginTop: 4 },
    stepWrap: { padding: "32px 24px" },
    progressBar: {
      display: "flex",
      gap: 4,
      marginBottom: 36,
    },
    progressDot: (active, done) => ({
      flex: 1,
      height: 3,
      borderRadius: 10,
      background: done ? "#3182f6" : active ? "#3182f6" : "#e5e8ec",
      transition: "background 0.3s",
    }),
    stepLabel: {
      fontSize: 13,
      color: "#888",
      fontWeight: 600,
      marginBottom: 10,
    },
    stepTitle: {
      fontSize: 24,
      fontWeight: 800,
      color: "#111",
      marginBottom: 28,
      letterSpacing: "-0.5px",
      lineHeight: 1.3,
    },
    textInput: {
      width: "100%",
      padding: "16px 18px",
      fontSize: 18,
      fontWeight: 600,
      border: "2px solid #e5e8ec",
      borderRadius: 12,
      outline: "none",
      background: "#fff",
      color: "#111",
      boxSizing: "border-box",
      transition: "border-color 0.2s",
    },
    optionGrid: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
    },
    optionBtn: (selected) => ({
      padding: "16px 12px",
      borderRadius: 12,
      border: selected ? "2px solid #3182f6" : "2px solid #e5e8ec",
      background: selected ? "#e8f1ff" : "#fff",
      color: selected ? "#3182f6" : "#333",
      fontSize: 15,
      fontWeight: 600,
      cursor: "pointer",
      transition: "all 0.15s",
      textAlign: "center",
    }),
    selectGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: 8,
    },
    selectBtn: (selected) => ({
      padding: "13px 8px",
      borderRadius: 10,
      border: selected ? "2px solid #3182f6" : "2px solid #e5e8ec",
      background: selected ? "#e8f1ff" : "#fff",
      color: selected ? "#3182f6" : "#333",
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer",
      transition: "all 0.15s",
    }),
    nextBtn: (disabled) => ({
      width: "100%",
      padding: "18px 0",
      background: disabled ? "#e5e8ec" : "#3182f6",
      color: disabled ? "#aaa" : "#fff",
      fontSize: 16,
      fontWeight: 700,
      border: "none",
      borderRadius: 14,
      cursor: disabled ? "default" : "pointer",
      marginTop: 32,
      transition: "background 0.2s",
      letterSpacing: "-0.3px",
    }),
    resultHeader: {
      padding: "32px 24px 20px",
    },
    resultTitle: {
      fontSize: 22,
      fontWeight: 800,
      color: "#111",
      letterSpacing: "-0.5px",
      marginBottom: 6,
    },
    resultSub: { fontSize: 14, color: "#888" },
    resultCount: {
      display: "inline-flex",
      alignItems: "center",
      background: "#3182f6",
      color: "#fff",
      borderRadius: 100,
      padding: "3px 10px",
      fontSize: 13,
      fontWeight: 700,
      marginLeft: 6,
    },
    benefitCard: {
      margin: "0 16px 12px",
      background: "#fff",
      borderRadius: 16,
      padding: "18px 18px",
      boxShadow: "0 1px 8px rgba(0,0,0,0.06)",
      cursor: "pointer",
      display: "flex",
      alignItems: "flex-start",
      gap: 14,
      transition: "transform 0.15s, box-shadow 0.15s",
      border: "2px solid transparent",
    },
    benefitIcon: (color) => ({
      width: 44,
      height: 44,
      borderRadius: 12,
      background: color,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 22,
      flexShrink: 0,
    }),
    benefitName: { fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 3 },
    benefitAmount: (accent) => ({
      fontSize: 14,
      fontWeight: 700,
      color: accent,
      marginBottom: 3,
    }),
    benefitDesc: { fontSize: 13, color: "#888", lineHeight: 1.5 },
    categoryPill: (accent) => ({
      display: "inline-flex",
      padding: "2px 8px",
      borderRadius: 100,
      fontSize: 11,
      fontWeight: 600,
      color: accent,
      background: "#f0f0f0",
      marginBottom: 5,
    }),
    modalOverlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.5)",
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "center",
      zIndex: 1000,
    },
    modalSheet: {
      width: "100%",
      maxWidth: 480,
      background: "#fff",
      borderRadius: "24px 24px 0 0",
      padding: "28px 24px 40px",
    },
    modalHandle: {
      width: 40,
      height: 4,
      background: "#e5e8ec",
      borderRadius: 10,
      margin: "0 auto 24px",
    },
    modalTag: { fontSize: 36, marginBottom: 12 },
    modalName: {
      fontSize: 22,
      fontWeight: 800,
      color: "#111",
      marginBottom: 6,
      letterSpacing: "-0.5px",
    },
    modalAmount: (accent) => ({
      fontSize: 18,
      fontWeight: 700,
      color: accent,
      marginBottom: 16,
    }),
    modalDesc: {
      fontSize: 15,
      color: "#555",
      lineHeight: 1.7,
      marginBottom: 24,
    },
    modalBtn: (accent) => ({
      width: "100%",
      padding: "16px 0",
      background: accent,
      color: "#fff",
      fontSize: 16,
      fontWeight: 700,
      border: "none",
      borderRadius: 12,
      cursor: "pointer",
      marginBottom: 10,
    }),
    modalCloseBtn: {
      width: "100%",
      padding: "14px 0",
      background: "#f7f8fa",
      color: "#555",
      fontSize: 15,
      fontWeight: 600,
      border: "none",
      borderRadius: 12,
      cursor: "pointer",
    },
    restartBtn: {
      display: "block",
      margin: "20px auto 40px",
      padding: "14px 28px",
      background: "#fff",
      color: "#3182f6",
      fontSize: 15,
      fontWeight: 700,
      border: "2px solid #3182f6",
      borderRadius: 12,
      cursor: "pointer",
    },
    noResult: {
      textAlign: "center",
      padding: "60px 24px",
      color: "#888",
      fontSize: 16,
    },
  };

  const renderStepContent = () => {
    const s = currentStep;
    if (s.id === "age") {
      return (
        <input
          style={styles.textInput}
          type="number"
          placeholder="예: 32"
          value={profile.age}
          onChange={(e) => setProfile({ ...profile, age: Number(e.target.value) })}
          min={1}
          max={100}
        />
      );
    }
    if (s.id === "region") {
      return (
        <div style={styles.selectGrid}>
          {REGIONS.map((r) => (
            <button
              key={r}
              style={styles.selectBtn(profile.region === r)}
              onClick={() => setProfile({ ...profile, region: r })}
            >
              {r}
            </button>
          ))}
        </div>
      );
    }
    if (s.id === "married") {
      return (
        <div style={styles.optionGrid}>
          {[{ label: "기혼", val: true }, { label: "미혼", val: false }].map((o) => (
            <button
              key={o.label}
              style={styles.optionBtn(profile.married === o.val)}
              onClick={() => setProfile({ ...profile, married: o.val })}
            >
              {o.label}
            </button>
          ))}
        </div>
      );
    }
    if (s.id === "pregnant") {
      return (
        <div style={styles.optionGrid}>
          {[{ label: "임신 중", val: true }, { label: "해당 없음", val: false }].map((o) => (
            <button
              key={o.label}
              style={styles.optionBtn(profile.pregnant === o.val)}
              onClick={() => setProfile({ ...profile, pregnant: o.val })}
            >
              {o.label}
            </button>
          ))}
        </div>
      );
    }
    if (s.id === "house") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {["자가 소유", "전세·월세", "무주택"].map((o) => (
            <button
              key={o}
              style={{
                ...styles.optionBtn(profile.house === o),
                gridColumn: "span 2",
                textAlign: "left",
                padding: "16px 20px",
              }}
              onClick={() => setProfile({ ...profile, house: o })}
            >
              {o}
            </button>
          ))}
        </div>
      );
    }
    if (s.id === "income") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {INCOME_OPTIONS.map((o) => (
            <button
              key={o}
              style={{
                ...styles.optionBtn(profile.income === o),
                textAlign: "left",
                padding: "16px 20px",
              }}
              onClick={() => setProfile({ ...profile, income: o })}
            >
              {o}
            </button>
          ))}
        </div>
      );
    }
  };

  if (step === -1) {
    return (
      <div style={styles.root}>
        <div style={styles.nav}>
          <span style={styles.logo}>al<span style={styles.logoAccent}>da</span></span>
        </div>
        <div style={styles.card}>
          <div style={styles.landingWrap}>
            <div style={styles.badge}>🇰🇷 AI 정부혜택 분석</div>
            <h1 style={styles.landingTitle}>
              내가 받을 수 있는<br />정부 혜택, 다 알려드려요
            </h1>
            <p style={styles.landingDesc}>
              복잡한 복지 정보를 한 번에.<br />
              6개 질문으로 맞춤 혜택을 찾아드려요.
            </p>
            <button
              style={styles.ctaBtn}
              onClick={() => setStep(0)}
            >
              혜택 찾기 시작하기 →
            </button>
            <div style={styles.statsRow}>
              {[
                { num: "12+", label: "연계 혜택 수" },
                { num: "1분", label: "소요 시간" },
                { num: "무료", label: "완전 무료" },
              ].map((s) => (
                <div key={s.label} style={styles.statBox}>
                  <div style={styles.statNum}>{s.num}</div>
                  <div style={styles.statLabel}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === STEPS.length) {
    const grouped = {};
    results.forEach((b) => {
      if (!grouped[b.category]) grouped[b.category] = [];
      grouped[b.category].push(b);
    });

    return (
      <div style={styles.root}>
        <div style={styles.nav}>
          <span style={styles.logo}>al<span style={styles.logoAccent}>da</span></span>
        </div>
        <div style={{ width: "100%", maxWidth: 480, margin: "0 auto" }}>
          <div style={styles.resultHeader}>
            <div style={styles.resultTitle}>
              {profile.region}에서 받을 수 있는 혜택
              <span style={styles.resultCount}>{results.length}</span>
            </div>
            <div style={styles.resultSub}>탭해서 신청 방법을 확인하세요</div>
          </div>

          {results.length === 0 ? (
            <div style={styles.noResult}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
              <div>입력하신 조건에 맞는 혜택을 찾지 못했어요</div>
            </div>
          ) : (
            Object.entries(grouped).map(([cat, items]) => (
              <div key={cat}>
                <div style={{ padding: "16px 20px 8px", fontSize: 13, fontWeight: 700, color: "#888" }}>
                  {cat}
                </div>
                {items.map((b) => (
                  <div
                    key={b.id}
                    style={styles.benefitCard}
                    onClick={() => setSelectedBenefit(b)}
                  >
                    <div style={styles.benefitIcon(b.color)}>{b.tag}</div>
                    <div style={{ flex: 1 }}>
                      <div style={styles.benefitName}>{b.name}</div>
                      <div style={styles.benefitAmount(b.accent)}>{b.amount}</div>
                      <div style={styles.benefitDesc}>{b.desc}</div>
                    </div>
                    <div style={{ color: "#ccc", fontSize: 18, alignSelf: "center" }}>›</div>
                  </div>
                ))}
              </div>
            ))
          )}

          <button style={styles.restartBtn} onClick={handleRestart}>
            다시 검색하기
          </button>
        </div>

        {selectedBenefit && (
          <div style={styles.modalOverlay} onClick={() => setSelectedBenefit(null)}>
            <div style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHandle} />
              <div style={styles.modalTag}>{selectedBenefit.tag}</div>
              <div style={styles.categoryPill(selectedBenefit.accent)}>
                {selectedBenefit.category}
              </div>
              <div style={styles.modalName}>{selectedBenefit.name}</div>
              <div style={styles.modalAmount(selectedBenefit.accent)}>
                {selectedBenefit.amount}
              </div>
              <div style={styles.modalDesc}>{selectedBenefit.desc}</div>
              <button
                style={styles.modalBtn(selectedBenefit.accent)}
                onClick={() => window.open("https://www.bokjiro.go.kr", "_blank")}
              >
                복지로에서 신청하기 →
              </button>
              <button style={styles.modalCloseBtn} onClick={() => setSelectedBenefit(null)}>
                닫기
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <div style={styles.nav}>
        <button
          style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#555" }}
          onClick={() => step > 0 ? setStep(step - 1) : setStep(-1)}
        >
          ←
        </button>
        <span style={styles.logo}>al<span style={styles.logoAccent}>da</span></span>
        <span style={{ fontSize: 13, color: "#999", fontWeight: 600 }}>
          {step + 1} / {STEPS.length}
        </span>
      </div>
      <div style={{ width: "100%", maxWidth: 480, padding: "20px 24px 0" }}>
        <div style={styles.progressBar}>
          {STEPS.map((_, i) => (
            <div key={i} style={styles.progressDot(i === step, i < step)} />
          ))}
        </div>
      </div>
      <div style={{ width: "100%", maxWidth: 480, padding: "0 24px" }}>
        <div style={styles.stepLabel}>
          {currentStep.icon} {currentStep.label}
        </div>
        <div style={styles.stepTitle}>
          {currentStep.id === "age" && "나이가 어떻게 되세요?"}
          {currentStep.id === "region" && "어디에 거주하고 계세요?"}
          {currentStep.id === "married" && "결혼하셨나요?"}
          {currentStep.id === "pregnant" && "임신 중이신가요?"}
          {currentStep.id === "house" && "주택을 소유하고 계신가요?"}
          {currentStep.id === "income" && "월 소득 구간이 어떻게 되세요?"}
        </div>
        {renderStepContent()}
        <button
          style={styles.nextBtn(!isStepComplete())}
          disabled={!isStepComplete()}
          onClick={handleNext}
        >
          {step === STEPS.length - 1 ? "혜택 찾기 →" : "다음"}
        </button>
      </div>
    </div>
  );
}
