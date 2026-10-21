export function WorkspaceShell({ chatList, children, density, isChatOpen, navigation, overlay }) {
  return (
    <main className={`workspace-screen ara-workspace-shell density-${density}`}>
      {navigation}
      {chatList}
      <section className={`workspace-main ara-workspace-main ${isChatOpen ? 'is-chat-open' : ''}`}>
        {children}
      </section>
      {overlay}
    </main>
  );
}
