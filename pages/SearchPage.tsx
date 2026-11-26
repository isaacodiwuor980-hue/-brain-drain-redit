import { useState, useEffect, useRef, useMemo } from "react";
import { Search as SearchIcon, Clock, X, BrainCircuit, Hash, User, MessageSquare, ArrowRight, Play, Eye, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trackEvent } from "@/lib/analytics";
import { idb } from "@/lib/db";
import { Mind, Topic, Post, getPostUpvoteCount } from "@/lib/types";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RuntimeEngine } from "@/components/RuntimeEngine";
import { MindDrawer } from "@/components/MindDrawer";
import { useSkills } from "@/hooks/use-skills";
import { useUserSearch, useFollowUser } from "@/hooks/use-discover";
import { safeStorage } from "@/lib/safe-storage";

export function SearchPage() {
  // Lazy init from URL `q` param + persisted recent searches — both are
  // sync, cheap, one-time mount reads (case b: the values won't change
  // unless the user types/searches), so a lazy useState initializer replaces
  // the old mount effect without changing behavior.
  const [query, setQuery] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("q") ?? "";
    } catch {
      return "";
    }
  });
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    const saved = safeStorage.getItem("mind-builder-recent-searches");
    if (saved) {
      try {
        return JSON.parse(saved) as string[];
      } catch {
        return [];
      }
    }
    return ["Artificial Intelligence", "React", "System Design", "Node.js"];
  });
  const [activeTab, setActiveTab] = useState("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Search Results State
  const [minds, setMinds] = useState<Mind[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Part 2 Task 6: Skills search (local IDB — server API is also available
  // via /api/v1/search/skills but we search local IDB for instant results).
  const { skills } = useSkills();

  // Phase 4 — server-side user search (fires when query is 3+ chars).
  const userSearch = useUserSearch(query);
  const followMutation = useFollowUser();

  // Runtime engine / Drawer modal state
  const [engineMind, setEngineMind] = useState<Mind | null>(null);
  const [isEngineOpen, setIsEngineOpen] = useState(false);
  const [drawerMind, setDrawerMind] = useState<Mind | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [allMinds, allTopics, allPosts] = await Promise.all([
          idb.getAll<Mind>("minds"),
          idb.getAll<Topic>("topics"),
          idb.getAll<Post>("posts"),
        ]);
        setMinds(allMinds || []);
        setTopics(allTopics || []);
        setPosts(allPosts || []);
      } catch (err) {
        console.error("Failed to load search index data", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;
    
    const updated = [trimmedQuery, ...recentSearches.filter(s => s !== trimmedQuery)].slice(0, 10);
    setRecentSearches(updated);
    safeStorage.setItem("mind-builder-recent-searches", JSON.stringify(updated));
    void trackEvent("search_submitted", {
      query: trimmedQuery,
      queryLength: trimmedQuery.length,
    });
  };

  const removeRecent = (search: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = recentSearches.filter(s => s !== search);
    setRecentSearches(updated);
    safeStorage.setItem("mind-builder-recent-searches", JSON.stringify(updated));
  };

  const handleRecentClick = (search: string) => {
    setQuery(search);
    const updated = [search, ...recentSearches.filter(s => s !== search)].slice(0, 10);
    setRecentSearches(updated);
    safeStorage.setItem("mind-builder-recent-searches", JSON.stringify(updated));
    void trackEvent("search_recent_selected", {
      query: search,
      queryLength: search.length,
    });
    inputRef.current?.focus();
  };

  const exportMind = (b: Mind) => {
    idb.getAllByIndex("nodes", "mind_id", b.id).then(nodes => {
      const exportObj = { minds: [b], nodes };
      const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(b.title || "mind").replace(/\s+/g, '-').toLowerCase()}-export.json`;
      a.click();
      URL.revokeObjectURL(url);
    }).catch(() => {
      toast({ title: "Export failed", description: "Could not read mind data.", variant: "destructive" });
    });
  };

  const deleteMind = async (mindId: string) => {
    await idb.delete("minds", mindId);
    setMinds(prev => prev.filter(b => b.id !== mindId));
    setIsDrawerOpen(false);
  };

  // Filtered collections
  const q = query.trim().toLowerCase();

  const matchingTopics = useMemo(() => {
    if (!q) return [];
    return topics.filter(t => 
      t.name.toLowerCase().includes(q) || 
      (t.description && t.description.toLowerCase().includes(q))
    );
  }, [topics, q]);

  const matchingMinds = useMemo(() => {
    if (!q) return [];
    return minds.filter(b => 
      b.title.toLowerCase().includes(q) || 
      b.description.toLowerCase().includes(q) || 
      b.category.toLowerCase().includes(q) ||
      (b.tags && b.tags.some(t => t.toLowerCase().includes(q)))
    );
  }, [minds, q]);

  const matchingPosts = useMemo(() => {
    if (!q) return [];
    return posts.filter(p => 
      p.content.toLowerCase().includes(q) || 
      (p.authorName && p.authorName.toLowerCase().includes(q)) ||
      (p.tags && p.tags.some(t => t.toLowerCase().includes(q)))
    );
  }, [posts, q]);

  // Suggested people based on authors in posts or topics
  const matchingPeople = useMemo(() => {
    if (!q) return [];
    const peopleMap = new Map<string, { name: string; role: string; count: number }>();
    
    // Static curated authors
    const curated = [
      { name: "Sarah Connor", role: "AI Researcher" },
      { name: "John Smith", role: "Frontend Lead" },
      { name: "Emma Watson", role: "Data Scientist" },
      { name: "Alice Dev", role: "TypeScript Architect" },
      { name: "Bob Builder", role: "Distributed Systems" }
    ];

    curated.forEach(p => {
      if (p.name.toLowerCase().includes(q) || p.role.toLowerCase().includes(q)) {
        peopleMap.set(p.name, { name: p.name, role: p.role, count: 5 });
      }
    });

    posts.forEach(p => {
      if (p.authorName && p.authorName.toLowerCase().includes(q)) {
        if (!peopleMap.has(p.authorName)) {
          peopleMap.set(p.authorName, { name: p.authorName, role: "Community Member", count: 1 });
        }
      }
    });

    return Array.from(peopleMap.values());
  }, [posts, q]);

  // Part 2 Task 6: skill search — local IDB (instant) + server API available.
  const matchingSkills = useMemo(() => {
    if (!q) return [];
    return skills.filter((s) => {
      const text = `${s.id} ${s.title} ${s.domain} ${s.make ?? ""} ${s.model ?? ""} ${s.part ?? ""} ${s.authorName} ${s.steps.map(st => st.action).join(" ")}`.toLowerCase();
      return text.includes(q);
    }).slice(0, 20);
  }, [skills, q]);

  const totalResults = matchingTopics.length + matchingMinds.length + matchingPosts.length + matchingPeople.length + matchingSkills.length;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 min-h-screen">
      <div className="sticky top-0 z-10 pt-2 pb-4 bg-background/90 backdrop-blur-xl">
        <form onSubmit={handleSearch} className="relative">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input 
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search minds, topics, people, and posts..." 
            className="w-full pl-12 pr-12 py-6 text-base rounded-full bg-muted/30 border border-border/40 focus-visible:ring-1 focus-visible:ring-primary/50 focus-visible:border-primary focus-visible:bg-background transition-all"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); inputRef.current?.focus(); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-muted-foreground/20 hover:bg-muted-foreground/30 flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </form>
      </div>

      {!query ? (
        <div className="mt-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Recent Searches</h2>
            {recentSearches.length > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-xs text-muted-foreground hover:text-foreground h-7"
                onClick={() => {
                  setRecentSearches([]);
                  safeStorage.removeItem("mind-builder-recent-searches");
                }}
              >
                Clear all
              </Button>
            )}
          </div>
          
          <ScrollArea className="h-[calc(100vh-220px)]">
            {recentSearches.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">No recent searches</p>
            ) : (
              <ul className="space-y-1">
                {recentSearches.map(search => (
                  <li key={search} className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      className="flex-1 justify-start h-12 px-4 text-sm font-normal group rounded-xl"
                      onClick={() => handleRecentClick(search)}
                      aria-label={`Search again for ${search}`}
                    >
                      <Clock className="w-4 h-4 mr-3 text-muted-foreground group-hover:text-primary transition-colors" aria-hidden />
                      <span className="flex-1 text-left truncate">{search}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                      onClick={(e) => removeRecent(search, e)}
                      aria-label={`Remove ${search} from recent searches`}
                    >
                      <X className="w-3.5 h-3.5" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
          <TabsList aria-label="Search result type" className="w-full justify-start border-b border-border/40 rounded-none bg-transparent h-12 p-0 overflow-x-auto flex-nowrap scrollbar-none">
            <TabsTrigger value="all" className="rounded-none data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground data-[state=active]:font-bold data-[state=active]:border-b-[3px] data-[state=active]:border-primary h-full px-5 text-sm text-muted-foreground hover:bg-muted/15 transition-all cursor-pointer">
              All ({totalResults})
            </TabsTrigger>
            <TabsTrigger value="minds" className="rounded-none data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground data-[state=active]:font-bold data-[state=active]:border-b-[3px] data-[state=active]:border-primary h-full px-5 text-sm text-muted-foreground hover:bg-muted/15 transition-all cursor-pointer">
              Minds ({matchingMinds.length})
            </TabsTrigger>
            <TabsTrigger value="topics" className="rounded-none data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground data-[state=active]:font-bold data-[state=active]:border-b-[3px] data-[state=active]:border-primary h-full px-5 text-sm text-muted-foreground hover:bg-muted/15 transition-all cursor-pointer">
              Topics ({matchingTopics.length})
            </TabsTrigger>
            <TabsTrigger value="posts" className="rounded-none data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground data-[state=active]:font-bold data-[state=active]:border-b-[3px] data-[state=active]:border-primary h-full px-5 text-sm text-muted-foreground hover:bg-muted/15 transition-all cursor-pointer">
              Posts ({matchingPosts.length})
            </TabsTrigger>
            <TabsTrigger value="people" className="rounded-none data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground data-[state=active]:font-bold data-[state=active]:border-b-[3px] data-[state=active]:border-primary h-full px-5 text-sm text-muted-foreground hover:bg-muted/15 transition-all cursor-pointer">
              People ({matchingPeople.length})
            </TabsTrigger>
            {/* Part 2 Task 6: Skills tab — searches the skill store (local IDB + server API) */}
            <TabsTrigger value="skills" className="rounded-none data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground data-[state=active]:font-bold data-[state=active]:border-b-[3px] data-[state=active]:border-primary h-full px-5 text-sm text-muted-foreground hover:bg-muted/15 transition-all cursor-pointer">
              Skills ({matchingSkills.length})
            </TabsTrigger>
          </TabsList>

          {totalResults === 0 && !isLoading ? (
            <div className="py-16 text-center">
              <SearchIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-30" />
              <h3 className="text-lg font-bold mb-1">No results found for "{query}"</h3>
              <p className="text-sm text-muted-foreground">Try searching with a different term or keyword.</p>
            </div>
          ) : (
            <div className="py-4 space-y-6">
              {/* TOP / ALL VIEW */}
              <TabsContent value="all" className="space-y-6 mt-0">
                {/* Matching Minds Section */}
                {matchingMinds.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <BrainCircuit className="w-3.5 h-3.5 text-primary" /> Minds ({matchingMinds.length})
                      </h3>
                      {matchingMinds.length > 3 && (
                        <Button variant="link" size="sm" onClick={() => setActiveTab("minds")} className="text-xs text-primary p-0 h-auto">
                          View all
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {matchingMinds.slice(0, 4).map(mind => (
                        <div 
                          key={mind.id}
                          className="bg-card/40 border border-border/40 hover:border-border/80 rounded-2xl p-4 transition-all hover:bg-muted/20 flex flex-col justify-between group"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                                {mind.category}
                              </span>
                              <span className="text-[11px] text-muted-foreground font-mono">
                                v{mind.version}
                              </span>
                            </div>
                            <h4 className="text-base font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                              {mind.title}
                            </h4>
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                              {mind.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/40">
                            <Button 
                              size="sm" 
                              variant="default"
                              className="flex-1 h-7 text-xs font-semibold rounded-full gap-1"
                              onClick={() => {
                                setEngineMind(mind);
                                setIsEngineOpen(true);
                              }}
                            >
                              <Play className="w-3 h-3 fill-current" /> Run Mind
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="h-7 text-xs font-semibold rounded-full gap-1 border-border/60"
                              onClick={() => {
                                setDrawerMind(mind);
                                setIsDrawerOpen(true);
                              }}
                            >
                              <Eye className="w-3 h-3" /> Inspect
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Matching Topics Section */}
                {matchingTopics.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Hash className="w-3.5 h-3.5 text-primary" /> Topics ({matchingTopics.length})
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {matchingTopics.map(topic => (
                        <button
                          key={topic.id}
                          onClick={() => setLocation(`/topics/${topic.id}`)}
                          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-muted/30 border border-border/40 hover:border-primary/40 hover:bg-muted/60 transition-all text-sm font-semibold cursor-pointer group active:scale-95"
                        >
                          <Hash className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
                          <span>{topic.name}</span>
                          <span className="text-xs text-muted-foreground font-normal">#{topic.id}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Matching Posts Section */}
                {matchingPosts.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-primary" /> Posts ({matchingPosts.length})
                      </h3>
                      {matchingPosts.length > 3 && (
                        <Button variant="link" size="sm" onClick={() => setActiveTab("posts")} className="text-xs text-primary p-0 h-auto">
                          View all
                        </Button>
                      )}
                    </div>
                    <div className="space-y-2.5">
                      {matchingPosts.slice(0, 3).map(post => (
                        <div 
                          key={post.id}
                          onClick={() => setLocation(`/?postId=${post.id}`)}
                          className="p-4 rounded-2xl bg-card/40 border border-border/40 hover:border-border/80 hover:bg-muted/20 transition-all cursor-pointer space-y-2"
                        >
                          <div className="flex items-center gap-2">
                            <Avatar className="w-6 h-6">
                              <AvatarFallback className="text-[10px] bg-muted font-bold">
                                {post.authorName?.slice(0, 2).toUpperCase() || "U"}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-xs font-bold text-foreground">{post.authorName || "Anonymous"}</span>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground">{new Date(post.createdAt).toLocaleDateString()}</span>
                          </div>
                          <p className="text-sm text-foreground/90 line-clamp-2">
                            {post.content}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                            <span>▲ {getPostUpvoteCount(post)}</span>
                            <span>💬 {post.commentCount || 0}</span>
                            {post.type && <span className="uppercase text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">{post.type}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Matching People Section */}
                {matchingPeople.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-primary" /> People ({matchingPeople.length})
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {matchingPeople.map(person => (
                        <div 
                          key={person.name}
                          onClick={() => setLocation(`/profile?userId=${encodeURIComponent(person.name)}`)}
                          className="flex items-center justify-between p-3 rounded-2xl bg-card/40 border border-border/40 hover:border-border/80 hover:bg-muted/20 transition-all cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar className="w-9 h-9">
                              <AvatarFallback className="text-xs bg-primary/10 text-primary font-bold">
                                {(person.name || "?").slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="truncate">
                              <h4 className="text-sm font-bold text-foreground truncate">{person.name}</h4>
                              <p className="text-xs text-muted-foreground truncate">{person.role}</p>
                            </div>
                          </div>
                          <Button size="sm" variant="ghost" className="h-7 text-xs rounded-full">
                            View
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* MINDS TAB */}
              <TabsContent value="minds" className="space-y-4 mt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {matchingMinds.map(mind => (
                    <div 
                      key={mind.id}
                      className="bg-card/40 border border-border/40 hover:border-border/80 rounded-2xl p-4 transition-all hover:bg-muted/20 flex flex-col justify-between group"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                            {mind.category}
                          </span>
                          <span className="text-[11px] text-muted-foreground font-mono">
                            v{mind.version}
                          </span>
                        </div>
                        <h4 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                          {mind.title}
                        </h4>
                        <p className="text-xs text-muted-foreground line-clamp-3 mt-1.5">
                          {mind.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/40">
                        <Button 
                          size="sm" 
                          variant="default"
                          className="flex-1 h-8 text-xs font-semibold rounded-full gap-1"
                          onClick={() => {
                            setEngineMind(mind);
                            setIsEngineOpen(true);
                          }}
                        >
                          <Play className="w-3 h-3 fill-current" /> Run Mind
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="h-8 text-xs font-semibold rounded-full gap-1 border-border/60"
                          onClick={() => {
                            setDrawerMind(mind);
                            setIsDrawerOpen(true);
                          }}
                        >
                          <Eye className="w-3 h-3" /> Inspect
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* TOPICS TAB */}
              <TabsContent value="topics" className="space-y-3 mt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {matchingTopics.map(topic => (
                    <div
                      key={topic.id}
                      onClick={() => setLocation(`/topics/${topic.id}`)}
                      className="p-4 rounded-2xl bg-card/40 border border-border/40 hover:border-primary/40 hover:bg-muted/20 transition-all cursor-pointer space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-base font-bold text-foreground flex items-center gap-1.5">
                          <Hash className="w-4 h-4 text-primary" /> {topic.name}
                        </h4>
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {topic.description || "Explore decision minds, conversations, and contributors."}
                      </p>
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* POSTS TAB */}
              <TabsContent value="posts" className="space-y-3 mt-0">
                {matchingPosts.map(post => (
                  <div 
                    key={post.id}
                    onClick={() => setLocation(`/?postId=${post.id}`)}
                    className="p-4 rounded-2xl bg-card/40 border border-border/40 hover:border-border/80 hover:bg-muted/20 transition-all cursor-pointer space-y-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <Avatar className="w-7 h-7">
                        <AvatarFallback className="text-xs bg-muted font-bold">
                          {post.authorName?.slice(0, 2).toUpperCase() || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-bold text-foreground">{post.authorName || "Anonymous"}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{new Date(post.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                      {post.content}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                      <span>▲ {getPostUpvoteCount(post)} Upvotes</span>
                      <span>💬 {post.commentCount || 0} Comments</span>
                      {post.type && <span className="uppercase text-[10px] bg-muted px-2 py-0.5 rounded font-mono">{post.type}</span>}
                    </div>
                  </div>
                ))}
              </TabsContent>

              {/* PEOPLE TAB */}
              <TabsContent value="people" className="space-y-3 mt-0">
                {/* Phase 4 — server-side user search (3+ chars) */}
                {query.trim().length >= 3 && userSearch.data && userSearch.data.length > 0 && (
                  <div className="mb-3">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Users ({userSearch.data.length})
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {userSearch.data.map((user) => (
                        <div key={user.id} className="flex items-center justify-between p-4 rounded-2xl bg-card/40 border border-border/40 hover:border-border/80 hover:bg-muted/20 transition-all">
                          <div className="flex items-center gap-3 min-w-0 cursor-pointer flex-1" onClick={() => setLocation(`/profile?userId=${encodeURIComponent(user.id)}`)}>
                            <Avatar className="w-10 h-10">
                              <AvatarImage src={user.avatarUrl ?? undefined} alt={user.displayName} />
                              <AvatarFallback className="text-sm bg-primary/10 text-primary font-bold">
                                {(user.displayName || "?").slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="truncate">
                              <h4 className="text-sm font-bold text-foreground truncate">{user.displayName}</h4>
                              <p className="text-xs text-muted-foreground truncate">@{user.username} · {user.followerCount} followers</p>
                            </div>
                          </div>
                          <Button size="sm" variant="outline" className="h-8 text-xs rounded-full border-border/60 ml-2" disabled={followMutation.isPending} onClick={() => followMutation.mutate(user.id)}>
                            Follow
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {query.trim().length >= 3 && userSearch.data && userSearch.data.length === 0 && !userSearch.isLoading && (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    No users found matching "{query}". Try a different search term.
                  </div>
                )}

                {/* Local suggestions (from seeded posts) */}
                {matchingPeople.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Suggested people
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {matchingPeople.map(person => (
                        <div key={person.name} onClick={() => setLocation(`/profile?userId=${encodeURIComponent(person.name)}`)} className="flex items-center justify-between p-4 rounded-2xl bg-card/40 border border-border/40 hover:border-border/80 hover:bg-muted/20 transition-all cursor-pointer">
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar className="w-10 h-10">
                              <AvatarFallback className="text-sm bg-primary/10 text-primary font-bold">
                                {(person.name || "?").slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="truncate">
                              <h4 className="text-sm font-bold text-foreground truncate">{person.name}</h4>
                              <p className="text-xs text-muted-foreground truncate">{person.role}</p>
                            </div>
                          </div>
                          <Button size="sm" variant="outline" className="h-8 text-xs rounded-full border-border/60">
                            Profile
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {query.trim().length < 3 && matchingPeople.length === 0 && (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    Type at least 3 characters to search for users by username.
                  </div>
                )}
              </TabsContent>

              {/* Part 2 Task 6: Skills tab — shows skill store results */}
              <TabsContent value="skills" className="space-y-3 mt-0">
                {matchingSkills.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No skills found. Publish skills from your mind library.
                  </div>
                ) : (
                  matchingSkills.map((skill) => (
                    <div
                      key={skill.id}
                      className="p-4 rounded-2xl bg-card/40 border border-border/40 hover:border-border/80 hover:bg-muted/20 transition-all"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Sparkles className="w-4 h-4 text-primary shrink-0" />
                            <h4 className="text-sm font-bold text-foreground truncate">{skill.title}</h4>
                          </div>
                          <p className="text-[10px] font-mono text-muted-foreground">{skill.id}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          skill.status === "published" ? "bg-emerald-500/15 text-emerald-600" :
                          skill.status === "in_review" ? "bg-amber-500/15 text-amber-600" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {skill.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">
                        By {skill.authorName}{skill.authorYearsExperience ? ` · ${skill.authorYearsExperience}y exp` : ""}
                      </p>
                      {skill.steps.length > 0 && (
                        <div className="space-y-1 mt-2 pt-2 border-t border-border/30">
                          <p className="text-[10px] font-mono uppercase text-muted-foreground">Step 1:</p>
                          <p className="text-xs text-foreground/80">{skill.steps[0].action}</p>
                          {skill.steps[0].tool && (
                            <p className="text-[10px] text-muted-foreground">Tool: {skill.steps[0].tool}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </TabsContent>
            </div>
          )}
        </Tabs>
      )}

      {/* Runtime Engine Modal for running matching minds directly from search */}
      {engineMind && (
        <RuntimeEngine 
          mind={engineMind}
          isOpen={isEngineOpen}
          onClose={() => setIsEngineOpen(false)}
        />
      )}

      {/* Mind Drawer for inspecting nodes/structure */}
      {drawerMind && (
        <MindDrawer 
          mind={drawerMind}
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          onLaunch={(b) => {
            setIsDrawerOpen(false);
            setEngineMind(b);
            setIsEngineOpen(true);
          }}
          onDelete={deleteMind}
          onExport={exportMind}
        />
      )}
    </div>
  );
}
