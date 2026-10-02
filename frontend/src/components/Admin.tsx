"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { BedDouble, CalendarDays, Database, FileText, Handshake, Info, LayoutPanelTop, LogOut, Ticket, Users } from "lucide-react";
import AdminAccommodation from "@/components/admin/AdminAccommodation";
import AdminSpeakers from "@/components/admin/AdminSpeakers";
import AdminCoupons from "@/components/admin/AdminCoupons";
import AdminMediaPartners from "@/components/admin/AdminMediaPartners";
import AdminSiteData from "@/components/admin/AdminSiteData";
import AdminContent from "@/components/admin/AdminContent";
import AdminInformation from "@/components/admin/AdminInformation";
import AdminSubmissions from "@/components/admin/AdminSubmissions";
import AdminConferenceSettings from "@/components/admin/AdminConferenceSettings";

const Admin = () => {
  const { user, isAdmin, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push("/admin-login");
    }
  }, [user, isAdmin, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen hero-gradient flex items-center justify-center">
        <p className="text-hero-foreground text-lg">Loading...</p>
      </div>
    );
  }

  if (!user || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Admin Header */}
      <header className="bg-hero-bg border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full gold-gradient flex items-center justify-center font-display font-bold text-hero-bg text-sm">
              MS
            </div>
            <h1 className="font-display text-hero-foreground text-lg">
              Admin Panel <span className="text-gold">2027</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">{user.email}</span>
            <Button variant="outline" size="sm" onClick={() => { signOut(); router.push("/"); }}>
              <LogOut className="w-4 h-4 mr-1" /> Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Admin Content */}
      <div className="container mx-auto px-4 py-8">
        <Tabs defaultValue="content" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 xl:grid-cols-9 max-w-7xl h-auto">
            <TabsTrigger value="content" className="flex items-center gap-2">
              <LayoutPanelTop className="w-4 h-4" /> Content
            </TabsTrigger>
            <TabsTrigger value="speakers" className="flex items-center gap-2">
              <Users className="w-4 h-4" /> Speakers
            </TabsTrigger>
            <TabsTrigger value="media-partners" className="flex items-center gap-2">
              <Handshake className="w-4 h-4" /> Media
            </TabsTrigger>
            <TabsTrigger value="site-data" className="flex items-center gap-2">
              <Database className="w-4 h-4" /> Data
            </TabsTrigger>
            <TabsTrigger value="information" className="flex items-center gap-2">
              <Info className="w-4 h-4" /> Information
            </TabsTrigger>
            <TabsTrigger value="submissions" className="flex items-center gap-2">
              <FileText className="w-4 h-4" /> Submissions
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4" /> Settings
            </TabsTrigger>
            <TabsTrigger value="coupons" className="flex items-center gap-2">
              <Ticket className="w-4 h-4" /> Coupons
            </TabsTrigger>
            <TabsTrigger value="accommodation" className="flex items-center gap-2">
              <BedDouble className="w-4 h-4" /> Accommodation
            </TabsTrigger>
          </TabsList>

          <TabsContent value="content">
            <AdminContent />
          </TabsContent>
          <TabsContent value="speakers">
            <AdminSpeakers />
          </TabsContent>
          <TabsContent value="media-partners">
            <AdminMediaPartners />
          </TabsContent>
          <TabsContent value="site-data">
            <AdminSiteData />
          </TabsContent>
          <TabsContent value="information">
            <AdminInformation />
          </TabsContent>
          <TabsContent value="submissions">
            <AdminSubmissions />
          </TabsContent>
          <TabsContent value="settings">
            <AdminConferenceSettings />
          </TabsContent>
          <TabsContent value="coupons">
            <AdminCoupons />
          </TabsContent>
          <TabsContent value="accommodation">
            <AdminAccommodation />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
