import { Dashboard } from "./dashboard";
import { Footer } from "./footer";
import { Header } from "./header";

export function App() {
  return (
    <div className="mx-auto my-0 p-8 text-center relative z-10 space-y-8 max-w-prose w-full">
      <Header />
      <Dashboard />
      <Footer />
    </div>
  );
}

export default App;
