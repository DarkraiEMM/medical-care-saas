import { BookOpen, ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { merchantHelpArticles } from "./merchant-help-content";

export function MerchantHelpCenter() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(merchantHelpArticles[0].id);
  const articles = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return merchantHelpArticles;
    return merchantHelpArticles.filter((article) =>
      `${article.category}${article.title}${article.summary}${article.sections
        .map((section) => `${section.title}${section.paragraphs || ""}${section.steps || ""}${section.notes || ""}`)
        .join("")}`
        .toLowerCase()
        .includes(keyword),
    );
  }, [query]);
  const selected =
    articles.find((article) => article.id === selectedId) || articles[0];

  return (
    <div className="merchant-help">
      <header className="topline">
        <div>
          <p>商家操作指南</p>
          <h1>帮助中心</h1>
        </div>
      </header>
      <div className="help-search">
        <Search size={18} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索功能、操作或权限问题"
          aria-label="搜索帮助内容"
        />
      </div>
      <div className="help-layout">
        <nav className="help-index" aria-label="帮助文章">
          {articles.length ? (
            articles.map((article) => (
              <button
                type="button"
                key={article.id}
                className={selected?.id === article.id ? "active" : ""}
                onClick={() => setSelectedId(article.id)}
              >
                <span><small>{article.category}</small><strong>{article.title}</strong></span>
                <ChevronRight size={16} />
              </button>
            ))
          ) : (
            <p>没有找到相关指南，请尝试更换关键词。</p>
          )}
        </nav>
        {selected ? (
          <article className="help-article">
            <div className="help-article-heading">
              <BookOpen size={24} />
              <div>
                <small>{selected.category}</small>
                <h2>{selected.title}</h2>
                <p>{selected.summary}</p>
              </div>
            </div>
            <div className="help-roles">
              <span>适用角色</span>
              {selected.roles.map((role) => <mark key={role}>{role}</mark>)}
            </div>
            {selected.sections.map((section) => (
              <section key={section.title}>
                <h3>{section.title}</h3>
                {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {section.steps ? (
                  <ol>{section.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                ) : null}
                {section.notes ? (
                  <ul>{section.notes.map((note) => <li key={note}>{note}</li>)}</ul>
                ) : null}
              </section>
            ))}
          </article>
        ) : null}
      </div>
    </div>
  );
}
