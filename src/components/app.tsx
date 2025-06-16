import { Cookie } from "./cookie";

export function App() {
  return (
    <div className="app space-y-8 max-w-prose">
      <div className="space-y-2">
        <h1 className="font-bold text-5xl">Mousehole</h1>
        <p>
          Keep your <a href="https://www.myanonamouse.net/">Myanonamouse</a>{" "}
          seedbox IP updated.
        </p>
      </div>

      <Cookie />

      <ol className="flex justify-between">
        <li>
          <a
            href="https://www.myanonamouse.net/f/t/84712/p/p1013257"
            target="_blank"
          >
            Forum Post
          </a>
        </li>
        <li>
          <a href="https://github.com/t-mart/mousehole" target="_blank">
            GitHub
          </a>
        </li>
        <li>
          <a href="https://hub.docker.com/r/tmmrtn/mousehole" target="_blank">
            Docker Hub
          </a>
        </li>
      </ol>
    </div>
  );
}

export default App;
