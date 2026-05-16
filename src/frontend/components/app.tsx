import { Footer } from "./footer";
import { Header } from "./header";
import { StateSections } from "./state-sections";

export function App() {
  return (
    <div className="mx-auto my-0 p-8 text-center relative z-10 space-y-8 max-w-prose w-full">
      <Header />
      <StateSections />
      <Footer />
    </div>
  );
}

export default App;
