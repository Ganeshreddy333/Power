"use client";

import Footer from "@/components/Footer";
import ImportantDates from "@/components/ImportantDates";
import Navbar from "@/components/Navbar";

const ImportantDatesPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-20 hero-gradient py-16">
        <div className="container mx-auto px-4 text-center">
          <h1 className="mb-4 font-display text-4xl font-bold text-gold md:text-5xl">Important Dates</h1>
        </div>
      </div>
      <ImportantDates />
      <Footer />
    </div>
  );
};

export default ImportantDatesPage;
