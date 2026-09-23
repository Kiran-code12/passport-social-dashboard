import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import "./translation.css";
import { getLanguageName } from "./languageNames";

const API_BASE = "https://passport-social-dashboard-p1he.onrender.com/api/posts";
const TRANSLATE_API = "https://passport-social-dashboard-p1he.onrender.com/api/translate";

const translationLanguages = [
  ["english", "English", "eng"],
  ["hindi", "Hindi", "hin"],
  ["spanish", "Spanish", "spa"],
  ["french", "French", "fra"],
  ["german", "German", "deu"],
  ["arabic", "Arabic", "arb"],
  ["chinese", "Chinese", "cmn"],
  ["russian", "Russian", "rus"],
  ["japanese", "Japanese", "jpn"],
  ["vietnamese", "Vietnamese", "vie"],
  ["indonesian", "Indonesian", "ind"],
].map(([value, label, code]) => ({ value, label, code }));

const platforms = ["All", "youtube", "reddit", "bluesky"];

const categories = [
  "All",
  "Application",
  "Renewal",
  "Appointments",
  "Tatkal",
  "Visa",
  "Travel Issues",
  "Government Announcements",
  "Scams/Fraud",
  "News",
  "Personal Experiences",
];

const sentiments = ["All", "Positive", "Neutral", "Negative"];

const timeRanges = [
  ["All", "All time"],
  ["24h", "Last 24 hours"],
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
].map(([value, label]) => ({ value, label }));

const engagementRanges = [
  [0, "Any engagement"],
  [10, "10+"],
  [50, "50+"],
  [100, "100+"],
  [500, "500+"],
  [1000, "1,000+"],
].map(([value, label]) => ({ value, label }));

function getCategory(post) {
  if (!post?.category) return "";

  if (typeof post.category === "string") {
    try {
      const parsed = JSON.parse(post.category);

      if (parsed && typeof parsed === "object") {
        return (
          parsed.category ||
          parsed.name ||
          parsed.label ||
          parsed.primary ||
          ""
        );
      }

      return parsed;
    } catch {
      return post.category;
    }
  }

  return (
    post.category.category ||
    post.category.name ||
    post.category.label ||
    post.category.primary ||
    ""
  );
}

function platformName(platform) {
  return (
    {
      youtube: "YouTube",
      reddit: "Reddit",
      bluesky: "Bluesky",
    }[platform] || platform
  );
}

function getPostId(post) {
  return post?.id || post?.post_id;
}

function getEngagement(post) {
  return Number(post?.total_engagement || 0);
}

function formatEngagement(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value;
}

function getEngagementInfo(post) {
  const engagement = post.engagement || {};

  if (post.platform === "reddit") {
    return {
      available: false,
      metrics: [],
    };
  }

  if (post.platform === "youtube") {
    return {
      available: true,
      metrics: [
        ["♥", engagement.likes],
        ["◉", engagement.views],
        ["💬", engagement.comments],
      ],
    };
  }

  if (post.platform === "bluesky") {
    return {
      available: true,
      metrics: [
        ["♥", engagement.likes],
        ["↗", engagement.reposts],
        ["💬", engagement.comments],
      ],
    };
  }

  return {
    available: true,
    metrics: [],
  };
}

function PostCard({
  post,
  clusteredCount = 1,
  expandedTranslationPosts,
  translations,
  translatingKeys,
  translationErrors,
  getSelectedTranslationLanguage,
  toggleTranslationPanel,
  setPostTranslationLanguage,
  translatePost,
}) {
  const postId = getPostId(post);
  const creator =
    post.creator_name || "Unknown creator";

  const handle = post.creator_handle
    ? `@${String(post.creator_handle).replace(
      /^@/,
      ""
    )}`
    : "";

  const postCategory = getCategory(post);
  const engagementInfo =
    getEngagementInfo(post);

  return (
    <article className="post-card">
      <div className="post-top">
        <div className="creator">
          <div className="avatar">
            {creator.charAt(0).toUpperCase()}
          </div>

          <div>
            <h3>{creator}</h3>
            <span>{handle}</span>
          </div>
        </div>

        <span
          className={`platform-badge ${post.platform}`}
        >
          {platformName(post.platform)}
        </span>
      </div>

      <div className="post-meta">
        {postCategory && (
          <span className="category-badge">
            {postCategory}
          </span>
        )}

        {post.sentiment && (
          <span
            className={`sentiment-badge ${post.sentiment.toLowerCase()}`}
          >
            {post.sentiment}
          </span>
        )}

        {post.language && (
          <span className="category-badge">
            {post.language}
          </span>
        )}

        {clusteredCount > 1 && (
          <span className="cluster-count">
            {clusteredCount} similar posts
          </span>
        )}
      </div>

      <p className="post-text">
        {post.original_text}
      </p>

      {post.summary && (
        <div className="ai-summary">
          <div className="ai-heading">
            <span>✦</span>
            AI SUMMARY
          </div>

          <p>{post.summary}</p>
        </div>
      )}

      <div className="translation-panel">
        <button
          type="button"
          className="translation-toggle"
          onClick={() => toggleTranslationPanel(postId)}
          aria-expanded={!!expandedTranslationPosts[postId]}
        >
          <span className="translation-toggle-icon">
            文
          </span>

          <span className="translation-toggle-text">
            <strong>Translate</strong>
            <small>
              View this post in another language
            </small>
          </span>

          <span className="translation-toggle-arrow">
            {expandedTranslationPosts[postId] ? "−" : "+"}
          </span>
        </button>

        {expandedTranslationPosts[postId] && (
          <div className="translation-content">
            <div className="translation-controls">
              <label className="translation-select-wrap">
                <span>Language</span>

                <select
                  value={getSelectedTranslationLanguage(postId)}
                  onChange={(e) =>
                    setPostTranslationLanguage(
                      postId,
                      e.target.value
                    )
                  }
                >
                  {translationLanguages.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                className="translate-button"
                onClick={() => translatePost(post)}
                disabled={translatingKeys.has(
                  `${postId}:${getSelectedTranslationLanguage(postId)}`
                )}
              >
                <span>✦</span>
                {translatingKeys.has(
                  `${postId}:${getSelectedTranslationLanguage(postId)}`
                )
                  ? "Translating…"
                  : "Translate post"}
              </button>
            </div>

            {translationErrors[
              `${postId}:${getSelectedTranslationLanguage(postId)}`
            ] && (
                <div className="translation-error">
                  {translationErrors[
                    `${postId}:${getSelectedTranslationLanguage(postId)}`
                  ]}
                </div>
              )}

            {(() => {
              const selectedLanguage =
                getSelectedTranslationLanguage(postId);
              const result =
                translations[postId]?.[selectedLanguage];

              if (!result) return null;

              return (
                <div className="translated-result">
                  <div className="translated-result-top">
                    <span className="translated-label">
                      {result.label}
                    </span>

                    <span className="translated-method">
                      {result.method || "Local translation"}
                    </span>
                  </div>

                  <p>{result.text}</p>
                </div>
              );
            })()}
          </div>
        )}
      </div>
      <div className="post-bottom">
        {engagementInfo.available ? (
          <div className="engagement">
            {engagementInfo.metrics.map(
              ([icon, value], i) => (
                <span key={i}>
                  {icon}{" "}
                  {formatEngagement(
                    Number(value || 0)
                  )}
                </span>
              )
            )}
          </div>
        ) : (
          <div className="engagement unavailable-engagement">
            <span className="engagement-unavailable">
              Engagement data unavailable
            </span>
          </div>
        )}

        <div className="post-actions">
          <span
            className={`total-engagement ${post.platform === "reddit"
              ? "unavailable-total"
              : ""
              }`}
          >
            {post.platform === "reddit"
              ? "Engagement unavailable"
              : `${formatEngagement(
                getEngagement(post)
              )} engagement`}
          </span>

          {post.post_url && (
            <a
              href={post.post_url}
              target="_blank"
              rel="noreferrer"
            >
              View original →
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function App() {
  const [posts, setPosts] = useState([]);
  const [allPosts, setAllPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("All");
  const [category, setCategory] = useState("All");
  const [sentiment, setSentiment] = useState("All");
  const [language, setLanguage] = useState("All");
  const [region, setRegion] = useState("");
  const [creator, setCreator] = useState("");

  const [debouncedRegion, setDebouncedRegion] = useState("");
  const [debouncedCreator, setDebouncedCreator] = useState("");

  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [minEngagement, setMinEngagement] = useState(0);
  const [timeRange, setTimeRange] = useState("All");
  const [sort, setSort] = useState("published_at-desc");
  const [viewMode, setViewMode] = useState("feed");
  const [activeNav, setActiveNav] = useState("dashboard");

  const [translations
    , setTranslations] = useState({});
  const [translationLanguagesByPost, setTranslationLanguagesByPost] = useState({});
  const [translatingKeys, setTranslatingKeys] = useState(
    () => new Set()
  );
  const [translationErrors, setTranslationErrors] = useState({});
  const [expandedTranslationPosts, setExpandedTranslationPosts] = useState({});

  const [expandedClusters, setExpandedClusters] = useState({});
  const postsRequestRef = useRef(null);

  const searchCacheRef = useRef(null);

  const lastEffectQueryRef = useRef(null);

  const languages = useMemo(() => {
    return translationLanguages.map((l) => l.code);
  }, []);

  const buildParams = () => {
    const params = new URLSearchParams();

    if (platform !== "All") {
      params.set("platform", platform);
    }

    if (category !== "All") {
      params.set("category", category);
    }

    if (sentiment !== "All") {
      params.set("sentiment", sentiment);
    }

    if (language !== "All") {
      params.set("language", language);
    }

    if (debouncedRegion.trim()) {
      params.set("region", debouncedRegion.trim());
    }

    if (debouncedCreator.trim()) {
      params.set("creator", debouncedCreator.trim());
    }

    if (minEngagement > 0) {
      params.set("minEngagement", String(minEngagement));
    }

    if (timeRange === "24h") {
      params.set("last24h", "true");
    } else if (timeRange === "7d") {
      const from = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000
      ).toISOString();

      params.set("from", from);
    } else if (timeRange === "30d") {
      const from = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      ).toISOString();

      params.set("from", from);
    }

    const [sortField, sortOrder] = sort.split("-");

    params.set("sort", sortField);
    params.set("order", sortOrder);

    return params;
  };

  async function fetchAllPosts() {
    try {
      const response = await fetch(API_BASE);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || "Failed to load posts");
      }

      setAllPosts(data.data || []);
    } catch (err) {
      console.error(err);
    }
  }

  function applyLocalFilters(items) {
    let results = [...items];

    if (platform !== "All") {
      results = results.filter(
        (p) => p.platform?.toLowerCase() === platform.toLowerCase()
      );
    }

    if (category !== "All") {
      results = results.filter((p) => getCategory(p) === category);
    }

    if (sentiment !== "All") {
      results = results.filter(
        (p) =>
          p.sentiment?.toLowerCase() === sentiment.toLowerCase()
      );
    }

    if (language !== "All") {
      results = results.filter(
        (p) =>
          String(p.language || "").toLowerCase() ===
          language.toLowerCase()
      );
    }

    if (debouncedRegion.trim()) {
      const wanted = debouncedRegion
        .toLowerCase()
        .replace(/\s+/g, "");

      results = results.filter((p) =>
        String(p.region || "")
          .toLowerCase()
          .replace(/\s+/g, "")
          .includes(wanted)
      );
    }

    if (debouncedCreator.trim()) {
      results = results.filter((p) =>
        `${p.creator_name || ""} ${p.creator_handle || ""}`
          .toLowerCase()
          .includes(debouncedCreator.trim().toLowerCase())
      );
    }

    if (minEngagement > 0) {
      results = results.filter(
        (p) => getEngagement(p) >= Number(minEngagement)
      );
    }

    if (timeRange !== "All") {
      const hours =
        timeRange === "24h"
          ? 24
          : timeRange === "7d"
            ? 168
            : 720;

      const cutoff =
        Date.now() - hours * 60 * 60 * 1000;

      results = results.filter((p) => {
        const timestamp = new Date(
          p.published_at || p.created_at || 0
        ).getTime();

        return timestamp >= cutoff;
      });
    }

    const [field, order] = sort.split("-");

    function toComparableNumber(value) {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    }

    function toComparableTimestamp(value) {
      if (!value) return 0;
      const t = new Date(value).getTime();
      return Number.isFinite(t) ? t : 0;
    }

    results.sort((a, b) => {
      const av =
        field === "engagement"
          ? toComparableNumber(getEngagement(a))
          : toComparableTimestamp(a[field]);

      const bv =
        field === "engagement"
          ? toComparableNumber(getEngagement(b))
          : toComparableTimestamp(b[field]);

      if (av === bv) {
        const aId = String(getPostId(a) || "");
        const bId = String(getPostId(b) || "");
        return aId.localeCompare(bId);
      }

      return order === "desc" ? bv - av : av - bv;
    });

    return results;
  }

  async function fetchFilteredPosts() {
  if (postsRequestRef.current) {
    postsRequestRef.current.abort();
  }

  const controller = new AbortController();
  postsRequestRef.current = controller;

  try {
    setLoading(true);
    setError("");

    const response = await fetch(
      `${API_BASE}?${buildParams().toString()}`,
      {
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      throw new Error(
        `Request failed with status ${response.status}`
      );
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(
        data.message || "Failed to load posts"
      );
    }

    if (controller.signal.aborted) return;

    setPosts(applyLocalFilters(data.data || []));
  } catch (err) {
    if (err.name === "AbortError") {
      return;
    }

    console.error("Filter request failed:", err);
    setError("Unable to load posts from the backend.");
  } finally {
    if (postsRequestRef.current === controller) {
      postsRequestRef.current = null;
      setLoading(false);
    }
  }
}

 async function searchBackend(query) {
  if (postsRequestRef.current) {
    postsRequestRef.current.abort();
  }

  const controller = new AbortController();
  postsRequestRef.current = controller;

  try {
    setLoading(true);
    setError("");

    const response = await fetch(
      `${API_BASE}/search?q=${encodeURIComponent(query)}`,
      {
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      throw new Error(
        `Search failed with status ${response.status}`
      );
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(
        data.message || "Search failed"
      );
    }

    if (controller.signal.aborted) return;

    searchCacheRef.current = { query, data: data.data || [] };

    setPosts(applyLocalFilters(data.data || []));
  } catch (err) {
    if (err.name === "AbortError") {
      return;
    }

    console.error("Search failed:", err);
    setError("Unable to search posts.");
  } finally {
    if (postsRequestRef.current === controller) {
      postsRequestRef.current = null;
      setLoading(false);
    }
  }
}

  useEffect(() => {
    fetchAllPosts();
  }, []);

  const commitSearch = () => setDebouncedSearch(search);
  const commitRegion = () => setDebouncedRegion(region);
  const commitCreator = () => setDebouncedCreator(creator);

  const onEnter = (commit) => (e) => {
    if (e.key === "Enter") {
      commit();
    }
  };

  useEffect(() => {
    const query = debouncedSearch.trim();

    const searchTermChanged = lastEffectQueryRef.current !== query;
    lastEffectQueryRef.current = query;

    if (query) {
      const cached = searchCacheRef.current;

      if (!searchTermChanged && cached && cached.query === query) {
        if (postsRequestRef.current) {
          postsRequestRef.current.abort();
        }

        setError("");
        setPosts(applyLocalFilters(cached.data));
      } else {
        searchBackend(query);
      }
    } else {
      searchCacheRef.current = null;
      fetchFilteredPosts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debouncedSearch,
    platform,
    category,
    sentiment,
    language,
    debouncedRegion,
    debouncedCreator,
    minEngagement,
    timeRange,
    sort,
  ]);

  useEffect(() => {
    const refreshInterval = setInterval(async () => {
      if (postsRequestRef.current) return;

      const controller = new AbortController();
      postsRequestRef.current = controller;

      try {
        const allResponse = await fetch(API_BASE);
        const allData = await allResponse.json();

        if (allData.success) {
          setAllPosts(allData.data || []);
        }

        if (debouncedSearch.trim()) {
          const searchResponse = await fetch(
            `${API_BASE}/search?q=${encodeURIComponent(debouncedSearch.trim())}`,
            { signal: controller.signal }
          );
          const searchData = await searchResponse.json();

          if (controller.signal.aborted) return;

          if (searchData.success) {
            searchCacheRef.current = {
              query: debouncedSearch.trim(),
              data: searchData.data || [],
            };

            setPosts(applyLocalFilters(searchData.data || []));
          }
        } else {
          const response = await fetch(
            `${API_BASE}?${buildParams().toString()}`,
            { signal: controller.signal }
          );
          const data = await response.json();

          if (controller.signal.aborted) return;

          if (data.success) {
            setPosts(applyLocalFilters(data.data || []));
          }
        }
      } catch (err) {
        if (err.name === "AbortError") return;

        console.error("Background refresh failed:", err);
      } finally {
        if (postsRequestRef.current === controller) {
          postsRequestRef.current = null;
        }
      }
    }, 60 * 1000);

    return () => clearInterval(refreshInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debouncedSearch,
    platform,
    category,
    sentiment,
    language,
    debouncedRegion,
    debouncedCreator,
    minEngagement,
    timeRange,
    sort,
  ]);

  const stats = useMemo(
    () => ({
      total: allPosts.length,
      youtube: allPosts.filter(
        (p) => p.platform === "youtube"
      ).length,
      reddit: allPosts.filter(
        (p) => p.platform === "reddit"
      ).length,
      bluesky: allPosts.filter(
        (p) => p.platform === "bluesky"
      ).length,
      positive: allPosts.filter(
        (p) => p.sentiment === "Positive"
      ).length,
      neutral: allPosts.filter(
        (p) => p.sentiment === "Neutral"
      ).length,
      negative: allPosts.filter(
        (p) => p.sentiment === "Negative"
      ).length,
      engagement: allPosts.reduce(
        (sum, p) => sum + getEngagement(p),
        0
      ),
    }),
    [allPosts]
  );

  const topCategories = useMemo(() => {
    const counts = {};

    allPosts.forEach((p) => {
      const cat = getCategory(p);

      if (cat) {
        counts[cat] = (counts[cat] || 0) + 1;
      }
    });

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [allPosts]);

  const groupedPosts = useMemo(() => {
    if (viewMode !== "cluster") return [];

    const groups = new Map();

    posts.forEach((post) => {
      const key =
        post.cluster_id ||
        `single-${getPostId(post)}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key).push(post);
    });

    return [...groups.entries()].map(
      ([clusterId, items]) => ({
        clusterId,
        items,
      })
    );
  }, [posts, viewMode]);

  function getSelectedTranslationLanguage(postId) {
    return translationLanguagesByPost[postId] || "hindi";
  }

  function setPostTranslationLanguage(postId, value) {
    setTranslationLanguagesByPost((current) => ({
      ...current,
      [postId]: value,
    }));
  }

  function toggleTranslationPanel(postId) {
    setExpandedTranslationPosts((current) => ({
      ...current,
      [postId]: !current[postId],
    }));
  }

  async function translatePost(post) {
    const postId = getPostId(post);
    const targetLanguage = getSelectedTranslationLanguage(postId);
    const translationKey = `${postId}:${targetLanguage}`;

    if (!postId || !post.original_text) return;

    if (translatingKeys.has(translationKey)) return;

    setTranslationErrors((current) => {
      const next = { ...current };
      delete next[translationKey];
      return next;
    });

    setExpandedTranslationPosts((current) => ({
      ...current,
      [postId]: true,
    }));

    setTranslatingKeys((current) => {
      const next = new Set(current);
      next.add(translationKey);
      return next;
    });

    try {
      const response = await fetch(TRANSLATE_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: post.original_text,
          sourceLanguage: post.language || "",
          targetLanguage,
          postId,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || data.message || "Translation failed"
        );
      }

      setTranslations((current) => ({
        ...current,
        [postId]: {
          ...(current[postId] || {}),
          [targetLanguage]: {
            language: targetLanguage,
            label:
              translationLanguages.find(
                (x) => x.value === targetLanguage
              )?.label || targetLanguage,
            text:
              data.translatedText ||
              data.translated ||
              data.translation ||
              "Translation returned no text.",
            method: data.method,
            truncatedAt: data.truncatedAt || null,
          },
        },
      }));
    } catch (err) {
      console.error("Translation failed:", err);
      setTranslationErrors((current) => ({
        ...current,
        [translationKey]:
          err.message || "Unable to translate this post.",
      }));
    } finally {
      setTranslatingKeys((current) => {
        const next = new Set(current);
        next.delete(translationKey);
        return next;
      });
    }
  }

  function goToSection(section) {
    setActiveNav(section);

    const id =
      section === "analytics"
        ? "analytics"
        : section === "feed"
          ? "intelligence-feed"
          : null;

    if (id) {
      document
        .getElementById(id)
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    } else {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  }

  function exportData(type) {
    setActiveNav("exports");

    const params = buildParams();

    if (debouncedSearch.trim()) {
      params.set("q", debouncedSearch.trim());
    }

    const query = params.toString();

    window.open(
      `${API_BASE}/export/${type}${query ? `?${query}` : ""
      }`,
      "_blank"
    );
  }

  function clearFilters() {
    setPlatform("All");
    setCategory("All");
    setSentiment("All");
    setLanguage("All");
    setRegion("");
    setCreator("");
    setDebouncedRegion("");
    setDebouncedCreator("");
    setDebouncedSearch("");
    setMinEngagement(0);
    setTimeRange("All");
    setSort("published_at-desc");
    setSearch("");
    setViewMode("feed");
  }

  const activeFilters = [
    platform !== "All"
      ? `Platform: ${platformName(platform)}`
      : null,

    category !== "All"
      ? `Category: ${category}`
      : null,

    sentiment !== "All"
      ? `Sentiment: ${sentiment}`
      : null,

    language !== "All"
      ? `Language: ${getLanguageName(language)}`
      : null,

    debouncedRegion.trim()
      ? `Region: ${debouncedRegion.trim()}`
      : null,

    debouncedCreator.trim()
      ? `Creator: ${debouncedCreator.trim()}`
      : null,

    minEngagement > 0
      ? `Engagement: ${formatEngagement(
        minEngagement
      )}+`
      : null,

    timeRange !== "All"
      ? `Time: ${timeRanges.find(
        (item) => item.value === timeRange
      )?.label || timeRange
      }`
      : null,

    sort !== "published_at-desc"
      ? `Sort: ${sort === "published_at-asc"
        ? "Oldest"
        : sort === "engagement-desc"
          ? "Most engaged"
          : "Least engaged"
      }`
      : null,
  ].filter(Boolean);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-mark">
            PS
          </div>

          <div>
            <strong>Passport</strong>
            <span>Intelligence</span>
          </div>
        </div>

        <div className="sidebar-section">
          <span className="sidebar-label">
            WORKSPACE
          </span>

          <button
            className={`nav-item ${activeNav === "dashboard"
              ? "active"
              : ""
              }`}
            onClick={() =>
              goToSection("dashboard")
            }
          >
            <span>▦</span>
            Dashboard
          </button>

          <button
            className={`nav-item ${activeNav === "feed"
              ? "active"
              : ""
              }`}
            onClick={() =>
              goToSection("feed")
            }
          >
            <span>◉</span>
            Live Feed
          </button>

          <button
            className={`nav-item ${activeNav === "analytics"
              ? "active"
              : ""
              }`}
            onClick={() =>
              goToSection("analytics")
            }
          >
            <span>◒</span>
            Analytics
          </button>
        </div>

        <div className="sidebar-section">
          <span className="sidebar-label">
            TOOLS
          </span>

          <button
            className={`nav-item ${activeNav === "exports"
              ? "active"
              : ""
              }`}
            onClick={() =>
              exportData("csv")
            }
          >
            <span>↓</span>
            Exports
          </button>
        </div>

        <div className="sidebar-bottom">
          <div className="system-status">
            <span></span>

            <div>
              <strong>
                System operational
              </strong>

              <small>
                All pipelines active
              </small>
            </div>
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="main-header">
          <div>
            <p className="eyebrow">
              SOCIAL INTELLIGENCE
            </p>

            <h1>Dashboard</h1>

            <p className="header-subtitle">
              Monitor passport conversations
              across social platforms.
            </p>
          </div>

          <div className="header-actions">
            <div className="live-pill">
              <span></span>
              Live monitoring
            </div>

            <button
              className="header-refresh"
              onClick={() => {
                fetchAllPosts();

                const query = debouncedSearch.trim();

                if (query) {
                  searchBackend(query);
                } else {
                  fetchFilteredPosts();
                }
              }}
              title="Refresh posts"
            >
              ↻
            </button>
          </div>
        </header>

        <main className="content">
          <section className="stats-grid">
            <div className="stat-card primary-stat">
              <div className="stat-card-header">
                <span>Total posts</span>
                <div className="stat-symbol">
                  ◎
                </div>
              </div>

              <strong>{stats.total}</strong>

              <small>
                Meaningful content collected
              </small>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <span>Total engagement</span>

                <div className="stat-symbol">
                  ↗
                </div>
              </div>

              <strong>
                {formatEngagement(
                  stats.engagement
                )}
              </strong>

              <small>
                Across collected posts
              </small>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <span>
                  Positive sentiment
                </span>

                <div className="stat-symbol positive-symbol">
                  +
                </div>
              </div>

              <strong>
                {stats.positive}
              </strong>

              <small>
                Posts detected as positive
              </small>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <span>Platforms</span>

                <div className="stat-symbol">
                  ◈
                </div>
              </div>

              <strong>3</strong>

              <small>
                YouTube · Reddit · Bluesky
              </small>
            </div>
          </section>

          <section
            className="analytics-grid"
            id="analytics"
          >
            <div className="analytics-card">
              <div className="analytics-heading">
                <div>
                  <h2>
                    Platform coverage
                  </h2>

                  <p>
                    Distribution of meaningful
                    posts
                  </p>
                </div>

                <span className="mini-badge">
                  {stats.total} posts
                </span>
              </div>

              <div className="platform-bars">
                {[
                  [
                    "YouTube",
                    stats.youtube,
                    "youtube-bar",
                  ],
                  [
                    "Bluesky",
                    stats.bluesky,
                    "bluesky-bar",
                  ],
                  [
                    "Reddit",
                    stats.reddit,
                    "reddit-bar",
                  ],
                ].map(
                  ([name, count, cls]) => (
                    <div
                      className="bar-row"
                      key={name}
                    >
                      <div>
                        <span>
                          {name}
                        </span>

                        <strong>
                          {count}
                        </strong>
                      </div>

                      <div className="bar-track">
                        <div
                          className={`bar ${cls}`}
                          style={{
                            width: `${stats.total
                              ? (count /
                                stats.total) *
                              100
                              : 0
                              }%`,
                          }}
                        />
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>

            <div className="analytics-card">
              <div className="analytics-heading">
                <div>
                  <h2>
                    Sentiment overview
                  </h2>

                  <p>
                    Detected sentiment across
                    posts
                  </p>
                </div>
              </div>

              <div className="sentiment-overview">
                <div className="sentiment-number">
                  <strong>
                    {stats.positive}
                  </strong>

                  <span>
                    Positive
                  </span>
                </div>

                <div className="sentiment-number neutral-number">
                  <strong>
                    {stats.neutral}
                  </strong>

                  <span>
                    Neutral
                  </span>
                </div>

                <div className="sentiment-number negative-number">
                  <strong>
                    {stats.negative}
                  </strong>

                  <span>
                    Negative
                  </span>
                </div>
              </div>

              <div className="sentiment-line">
                <div
                  className="positive-line"
                  style={{
                    width: `${stats.total
                      ? (stats.positive /
                        stats.total) *
                      100
                      : 0
                      }%`,
                  }}
                />

                <div
                  className="neutral-line"
                  style={{
                    width: `${stats.total
                      ? (stats.neutral /
                        stats.total) *
                      100
                      : 0
                      }%`,
                  }}
                />

                <div
                  className="negative-line"
                  style={{
                    width: `${stats.total
                      ? (stats.negative /
                        stats.total) *
                      100
                      : 0
                      }%`,
                  }}
                />
              </div>
            </div>
          </section>

          <section
            className="feed-section"
            id="intelligence-feed"
          >
            <div className="feed-heading">
              <div>
                <div className="feed-title">
                  <h2>
                    Intelligence feed
                  </h2>

                  <span>
                    {posts.length}
                  </span>
                </div>

                <p>
                  Passport-related
                  conversations collected
                  from social platforms.
                </p>
              </div>
            </div>

            <div className="filter-panel">
              <div className="search-box">
                <span>⌕</span>

                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    if (!e.target.value.trim()) {
                      setDebouncedSearch("");
                    }
                  }}
                  onKeyDown={onEnter(commitSearch)}
                  placeholder="Search posts, summaries, translations..."
                />

                {search && (
                  <button
                    onClick={() => {
                      setSearch("");
                      setDebouncedSearch("");
                    }}
                    className="clear-search"
                  >
                    ×
                  </button>
                )}

                <button
                  type="button"
                  className="search-submit"
                  onClick={commitSearch}
                >
                  Search
                </button>
              </div>

              <select
                value={platform}
                onChange={(e) =>
                  setPlatform(e.target.value)
                }
              >
                {platforms.map((p) => (
                  <option
                    key={p}
                    value={p}
                  >
                    {p === "All"
                      ? "All platforms"
                      : platformName(p)}
                  </option>
                ))}
              </select>

              <select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value)
                }
              >
                {categories.map((c) => (
                  <option
                    key={c}
                    value={c}
                  >
                    {c === "All"
                      ? "All categories"
                      : c}
                  </option>
                ))}
              </select>

              <select
                value={sentiment}
                onChange={(e) =>
                  setSentiment(e.target.value)
                }
              >
                {sentiments.map((s) => (
                  <option
                    key={s}
                    value={s}
                  >
                    {s === "All"
                      ? "All sentiment"
                      : s}
                  </option>
                ))}
              </select>

              <select
                value={language}
                onChange={(e) =>
                  setLanguage(e.target.value)
                }
              >
                <option value="All">
                  All languages
                </option>

                {languages.map((l) => (
                  <option
                    key={l}
                    value={l}
                  >
                    {getLanguageName(l)}
                  </option>
                ))}
              </select>

              <select
                value={minEngagement}
                onChange={(e) =>
                  setMinEngagement(
                    Number(e.target.value)
                  )
                }
              >
                {engagementRanges.map(
                  (x) => (
                    <option
                      key={x.value}
                      value={x.value}
                    >
                      {x.label}
                    </option>
                  )
                )}
              </select>

              <select
                value={timeRange}
                onChange={(e) =>
                  setTimeRange(e.target.value)
                }
              >
                {timeRanges.map((x) => (
                  <option
                    key={x.value}
                    value={x.value}
                  >
                    {x.label}
                  </option>
                ))}
              </select>

              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="published_at-desc">
                  Newest
                </option>

                <option value="published_at-asc">
                  Oldest
                </option>

                <option value="engagement-desc">
                  Most engaged
                </option>

                <option value="engagement-asc">
                  Least engaged
                </option>
              </select>

              <div className="text-filter-group">
                <input
                  value={region}
                  onChange={(e) => {
                    setRegion(e.target.value);
                    if (!e.target.value.trim()) {
                      setDebouncedRegion("");
                    }
                  }}
                  onKeyDown={onEnter(commitRegion)}
                  placeholder="Region / country"
                />
                <button
                  type="button"
                  className="search-submit"
                  onClick={commitRegion}
                >
                  Search
                </button>
              </div>

              <div className="text-filter-group">
                <input
                  value={creator}
                  onChange={(e) => {
                    setCreator(e.target.value);
                    if (!e.target.value.trim()) {
                      setDebouncedCreator("");
                    }
                  }}
                  onKeyDown={onEnter(commitCreator)}
                  placeholder="Creator / @handle"
                />
                <button
                  type="button"
                  className="search-submit"
                  onClick={commitCreator}
                >
                  Search
                </button>
              </div>

              <div className="filter-actions">
                <button
                  type="button"
                  onClick={clearFilters}
                >
                  Clear
                </button>

                <button
                  type="button"
                  className={
                    viewMode === "feed"
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    setViewMode("feed")
                  }
                >
                  Feed
                </button>

                <button
                  type="button"
                  className={
                    viewMode === "cluster"
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    setViewMode("cluster")
                  }
                >
                  Clusters
                </button>
              </div>
            </div>

            <div className="feed-tools">
              <span>
                {viewMode === "cluster"
                  ? `${groupedPosts.length} topic groups from ${posts.length} matching posts`
                  : `${posts.length} matching posts`}
              </span>

              <div>
                <button
                  onClick={() =>
                    exportData("csv")
                  }
                >
                  Export CSV
                </button>

                <button
                  onClick={() =>
                    exportData("pdf")
                  }
                >
                  Export PDF
                </button>
              </div>
            </div>

            {activeFilters.length > 0 && (
              <div className="active-filters">
                <span>
                  Active filters
                </span>

                {activeFilters.map(
                  (filter) => (
                    <span
                      className="active-filter-chip"
                      key={filter}
                    >
                      {filter}
                    </span>
                  )
                )}

                <button
                  type="button"
                  onClick={clearFilters}
                >
                  Clear all
                </button>
              </div>
            )}

            {activeFilters.length === 0 &&
              !loading && (
                <div className="filter-status">
                  Showing the current
                  dashboard feed without
                  additional filters.
                </div>
              )}

            {topCategories.length > 0 && (
              <div className="category-strip">
                <span>
                  Top categories
                </span>

                {topCategories.map(
                  ([name, count]) => (
                    <button
                      key={name}
                      onClick={() =>
                        setCategory(name)
                      }
                      className={
                        category === name
                          ? "category-chip selected"
                          : "category-chip"
                      }
                    >
                      {name}
                      <b>{count}</b>
                    </button>
                  )
                )}
              </div>
            )}

            {loading && (
              <div className="state-box">
                <div className="loader"></div>

                <h3>
                  Loading intelligence
                  feed
                </h3>

                <p>
                  Querying the backend...
                </p>
              </div>
            )}

            {error && !loading && (
              <div className="state-box error-state">
                <div className="error-icon">
                  !
                </div>

                <h3>
                  Backend connection
                  failed
                </h3>

                <p>{error}</p>

                <button
                  onClick={() => {
                    fetchAllPosts();

                    const query = debouncedSearch.trim();

                    if (query) {
                      searchBackend(query);
                    } else {
                      fetchFilteredPosts();
                    }
                  }}
                >
                  Try again
                </button>
              </div>
            )}

            {!loading &&
              !error &&
              posts.length === 0 && (
                <div className="state-box">
                  <div className="empty-icon">
                    ⌕
                  </div>

                  <h3>
                    No matching posts
                  </h3>

                  <p>
                    Try changing your
                    filters or search
                    query.
                  </p>
                </div>
              )}

            {!loading &&
              !error &&
              posts.length > 0 &&
              viewMode === "feed" && (
                <div className="posts-grid">
                  {posts.map((post) => (
                    <PostCard
                      key={getPostId(post)}
                      post={post}
                      expandedTranslationPosts={expandedTranslationPosts}
                      translations={translations}
                      translatingKeys={translatingKeys}
                      translationErrors={translationErrors}
                      getSelectedTranslationLanguage={getSelectedTranslationLanguage}
                      toggleTranslationPanel={toggleTranslationPanel}
                      setPostTranslationLanguage={setPostTranslationLanguage}
                      translatePost={translatePost}
                    />
                  ))}
                </div>
              )}

            {!loading &&
              !error &&
              posts.length > 0 &&
              viewMode === "cluster" && (
                <div className="cluster-list">
                  {groupedPosts.map(
                    ({
                      clusterId,
                      items,
                    }) => (
                      <section
                        className="cluster-card"
                        key={clusterId}
                      >
                        <div className="cluster-header">
                          <div>
                            <span>
                              TOPIC CLUSTER
                            </span>

                            <h3>
                              {items[0]
                                .summary ||
                                getCategory(
                                  items[0]
                                ) ||
                                "Related passport conversation"}
                            </h3>
                          </div>

                          <strong>
                            {items.length}{" "}
                            {items.length ===
                              1
                              ? "post"
                              : "posts"}
                          </strong>
                        </div>

                        <div className="cluster-posts">
                          {items
                            .slice(
                              0,
                              expandedClusters[clusterId]
                                ? items.length
                                : 3
                            )
                            .map(
                              (post) => (
                                <PostCard
                                  key={getPostId(post)}
                                  post={post}
                                  clusteredCount={items.length}
                                  expandedTranslationPosts={expandedTranslationPosts}
                                  translations={translations}
                                  translatingKeys={translatingKeys}
                                  translationErrors={translationErrors}
                                  getSelectedTranslationLanguage={getSelectedTranslationLanguage}
                                  toggleTranslationPanel={toggleTranslationPanel}
                                  setPostTranslationLanguage={setPostTranslationLanguage}
                                  translatePost={translatePost}
                                />
                              )
                            )}
                        </div>

                        {items.length > 3 && (
                          <button
                            type="button"
                            className="cluster-more"
                            aria-expanded={
                              expandedClusters[clusterId]
                                ? true
                                : false
                            }
                            onClick={() =>
                              setExpandedClusters(
                                (current) => ({
                                  ...current,
                                  [clusterId]:
                                    !current[clusterId],
                                })
                              )
                            }
                          >
                            {expandedClusters[clusterId]
                              ? "Show less"
                              : `+ ${items.length - 3} more similar posts in this cluster`}
                          </button>
                        )}
                      </section>
                    )
                  )}
                </div>
              )}
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;