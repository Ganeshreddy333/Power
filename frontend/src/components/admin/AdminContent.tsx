import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/integrations/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Save, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Tables, TablesInsert } from "@/integrations/api/types";

type Content = Tables<"website_content">;

const defaultSections: Array<TablesInsert<"website_content">> = [
  { section_key: "hero_title", title: "Homepage Hero Title", content: "WORLD CONFERENCE ON RENEWABLE ENERGY\n& SUSTAINABLE ENERGY" },
  { section_key: "hero_subtitle", title: "Homepage Hero Date Line", content: "March 3-4, 2027 | #22-28, V.V. Nagar, Chaitanyapuri, Hyderabad, Telangana 500060, India" },
  { section_key: "about_intro", title: "About Conference", content: "Renewable Energy - 2027 is a global forum for scientists, keynote speakers, industry pioneers, and policy leaders advancing low-carbon and sustainable energy futures." },
  { section_key: "home_welcome", title: "Homepage Welcome", content: "Welcome to Renewable Energy - 2027." },
  { section_key: "registration_heading", title: "Registration Heading", content: "Register to join the conference." },
  { section_key: "abstract_intro", title: "Abstract Submission Introduction", content: "Submit your research abstract and supporting materials." },
  { section_key: "abstract_guidelines", title: "Abstract Submission Guidelines", content: "Please follow the submission requirements carefully." },
  { section_key: "scientific_sessions", title: "Scientific Sessions", content: "Browse the conference's scientific sessions." },
];

const AdminContent = () => {
  const [contents, setContents] = useState<Content[]>([]);
  const [newSection, setNewSection] = useState({ section_key: "", title: "", content: "" });
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const fetchContent = useCallback(async () => {
    const { data, error } = await apiClient
      .from("website_content")
      .select("*")
      .order("section_key", { ascending: true });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    if (data) setContents(data);
  }, [toast]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const initDefaults = async () => {
    for (const section of defaultSections) {
      const exists = contents.find((c) => c.section_key === section.section_key);
      if (!exists) {
        await apiClient.from("website_content").insert(section);
      }
    }
    toast({ title: "Default sections initialized!" });
    fetchContent();
  };

  const handleUpdate = async (id: string, title: string, content: string) => {
    const { error } = await apiClient.from("website_content").update({ title, content }).eq("id", id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Content saved!" });
    await fetchContent();
  };

  const handleAddSection = async () => {
    if (!newSection.section_key.trim()) {
      toast({ title: "Section key is required", variant: "destructive" });
      return;
    }

    const section: TablesInsert<"website_content"> = {
      section_key: newSection.section_key.trim(),
      title: newSection.title.trim() || null,
      content: newSection.content.trim() || null,
    };

    const { error } = await apiClient.from("website_content").insert(section);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Section added!" });
    setNewSection({ section_key: "", title: "", content: "" });
    setOpen(false);
    await fetchContent();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="font-display">Website Content</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={initDefaults}>Init Defaults</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gold-gradient text-hero-bg" size="sm"><Plus className="w-4 h-4 mr-1" /> Add Section</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-display">Add Content Section</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Section Key (e.g. footer_text)" value={newSection.section_key} onChange={(e) => setNewSection({ ...newSection, section_key: e.target.value })} />
                <Input placeholder="Title" value={newSection.title} onChange={(e) => setNewSection({ ...newSection, title: e.target.value })} />
                <Textarea placeholder="Content" value={newSection.content} onChange={(e) => setNewSection({ ...newSection, content: e.target.value })} />
                <Button onClick={handleAddSection} className="w-full">Add Section</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {contents.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">No content sections yet.</p>
            <Button onClick={initDefaults}>Initialize Default Sections</Button>
          </div>
        ) : (
          contents.map((item) => (
            <ContentRow key={item.id} item={item} onSave={handleUpdate} />
          ))
        )}
      </CardContent>
    </Card>
  );
};

const ContentRow = ({ item, onSave }: { item: Content; onSave: (id: string, title: string, content: string) => void }) => {
  const [title, setTitle] = useState(item.title || "");
  const [content, setContent] = useState(item.content || "");

  return (
    <div className="border border-border rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded">{item.section_key}</span>
        <Button variant="ghost" size="sm" onClick={() => onSave(item.id, title, content)}>
          <Save className="w-4 h-4 mr-1" /> Save
        </Button>
      </div>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="text-sm" />
      <Textarea
        className="min-h-[60px]"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Content"
      />
    </div>
  );
};

export default AdminContent;
