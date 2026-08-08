import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

function App() {
  return (
    <main>
      <header>
        <p>平台侧 · 模拟环境</p>
        <h1>机构运行状态</h1>
      </header>
      <section>
        <div>
          <span>试点机构</span>
          <strong>1</strong>
        </div>
        <div>
          <span>临时支持授权</span>
          <strong>0</strong>
        </div>
        <div>
          <span>异常异步任务</span>
          <strong>0</strong>
        </div>
      </section>
      <article>
        <h2>平台人员默认不可查看机构业务正文</h2>
        <p>
          投诉或争议处理需要由机构发起限时授权；查看和下载权限分别授予，并完整记录审计日志。
        </p>
      </article>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
