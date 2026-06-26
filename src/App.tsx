import TitleBar from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import KnowledgeMap from "./components/KnowledgeMap";
import Inspector from "./components/Inspector";
import "./App.css";

export default function App() {
  return (
    <div className="app">
      <TitleBar />
      <div className="app-body">
        <Sidebar />
        <KnowledgeMap />
        <Inspector />
      </div>
    </div>
  );
}
