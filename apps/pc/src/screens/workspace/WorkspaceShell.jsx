export function WorkspaceShell({ chatList, children, density, isChatOpen, isStandalonePage, navigation, overlay }) {
  return (
    <main className={`workspace-screen ara-workspace-shell density-${density} ${isStandalonePage ? 'is-standalone-page' : ''}`}>
      {navigation}
      {isStandalonePage ? null : chatList}
      <section className={`workspace-main ara-workspace-main ${isChatOpen ? 'is-chat-open' : ''}`}>
        {children}
      </section>
      {overlay}
    </main>
  );
}
