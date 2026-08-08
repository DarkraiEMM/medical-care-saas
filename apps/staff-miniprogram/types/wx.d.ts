declare namespace WechatMiniprogram {
  interface BaseEvent {
    currentTarget: { dataset: Record<string, unknown> };
  }
}

declare function App(options: Record<string, unknown>): void;
declare function Page(options: Record<string, unknown>): void;
declare const wx: {
  showToast(options: { title: string; icon: "none" | "success" }): void;
};
