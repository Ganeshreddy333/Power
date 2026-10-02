"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { splitLines, useWebsiteContent } from "@/hooks/useWebsiteContent";

export const tracks = [
  {
    title: "Advanced Solar Energy Technologies",
    description:
      "Advancements in solar energy continue to drive the global transition toward clean power. This track highlights innovations in perovskite, tandem, and bifacial photovoltaic systems aimed at improving efficiency and scalability. It includes emerging materials, system optimization, and large-scale deployment strategies. Applications such as floating solar and agrivoltaics are also explored. Emphasis is placed on integrating solar technologies into modern energy systems.",
  },
  {
    title: "Wind, Hydro & Ocean Energy Systems",
    description:
      "Renewable power generation from wind, hydro, and marine sources plays a critical role in energy diversification. Developments in offshore wind, smart turbine technologies, and small-scale hydro systems are emphasized. Ocean energy solutions, including tidal and wave systems, are gaining increasing attention. Performance optimization and hybrid system integration are key focus areas. Environmental sustainability and long-term feasibility are also addressed.",
  },
  {
    title: "Energy Storage & Battery Innovations",
    description:
      "Reliable energy storage is essential for balancing renewable energy supply and demand. Innovations in lithium-ion, solid-state, sodium-ion, and flow batteries are transforming storage capabilities. Improvements in energy density, safety, lifecycle, and recycling are central to this track. Grid-scale storage and decentralized energy solutions are also explored. The role of storage in enhancing grid stability is highlighted.",
  },
  {
    title: "Hydrogen Energy & Clean Fuels",
    description:
      "Hydrogen is emerging as a key component of the future clean energy landscape. Advances in green hydrogen production, fuel cells, and Power-to-X technologies are shaping new possibilities. Storage, transportation, and infrastructure development are critical challenges being addressed. Industrial and mobility applications are expanding rapidly. The transition toward a hydrogen-based economy is a major focus.",
  },
  {
    title: "AI, IoT & Digital Energy Systems",
    description:
      "Digital transformation is revolutionizing energy systems through intelligent technologies. Artificial intelligence and IoT enable predictive maintenance, smart grid management, and real-time decision-making. Data-driven optimization enhances efficiency and reliability across energy networks. Digital twins and automation are redefining system performance. Secure and scalable digital infrastructure is increasingly important.",
  },
  {
    title: "Climate Change & Net-Zero Strategies",
    description:
      "Global efforts toward climate mitigation require innovative and integrated energy solutions. Pathways to achieving net-zero emissions are explored through policy, technology, and sustainable practices. Carbon reduction strategies, ESG frameworks, and international agreements play a key role. Adaptation and resilience measures are also critical. Long-term sustainability and environmental impact remain central themes.",
  },
  {
    title: "Smart Cities & Sustainable Infrastructure",
    description:
      "Urbanization demands energy-efficient and sustainable infrastructure solutions. Smart cities integrate renewable energy, digital systems, and intelligent planning to optimize resource use. Green buildings and energy-efficient technologies are key components. Urban mobility and infrastructure resilience are also emphasized. The role of data-driven systems in shaping future cities is explored.",
  },
  {
    title: "Carbon Capture & Environmental Technologies",
    description:
      "Reducing carbon emissions is essential for addressing global climate challenges. Advanced carbon capture, utilization, and storage technologies are being developed to minimize environmental impact. Negative emission technologies and sustainable industrial practices are gaining importance. Environmental monitoring and pollution control strategies are also included. Innovative solutions for long-term sustainability are highlighted.",
  },
  {
    title: "Power Systems & Grid Integration",
    description:
      "Modern power systems must adapt to increasing renewable energy penetration. Integration of distributed energy resources, microgrids, and smart grids is transforming electricity networks. Maintaining grid stability, reliability, and efficiency is a major focus. Advanced control systems and energy management solutions are explored. The transition toward flexible and resilient power systems is emphasized.",
  },
  {
    title: "Energy Economics, Policy & Management",
    description:
      "Sustainable energy transitions require strong economic and policy frameworks. Market dynamics, investment strategies, and regulatory mechanisms are key areas of discussion. Energy governance and policy innovations influence global energy development. Financial models and risk assessment are also explored. Strategic planning supports long-term sustainability goals.",
  },
  {
    title: "E-Mobility & Future Transportation",
    description:
      "The shift toward sustainable transportation is accelerating through electrification and innovation. Electric vehicles, charging infrastructure, and smart mobility solutions are central to this track. Integration with renewable energy systems enhances sustainability. Advances in battery technology and transportation planning are also explored. Policy and market adoption trends play a significant role.",
  },
  {
    title: "Emerging & Future Energy Technologies",
    description:
      "Breakthrough technologies are shaping the future of global energy systems. Innovations such as fusion energy, advanced materials, and next-generation concepts are explored. Research focuses on high-impact solutions with transformative potential. Experimental and interdisciplinary approaches are encouraged. The track highlights visionary developments in energy science.",
  },
  {
    title: "Interdisciplinary & Applied Research",
    description:
      "Complex energy challenges require collaboration across multiple disciplines. Applied research and real-world case studies demonstrate practical implementation of technologies. Industry partnerships and technology transfer are emphasized. Innovation ecosystems and commercialization pathways are explored. The track promotes integration between research and application.",
  },
  {
    title: "Grid Digitalization & Smart Energy Analytics",
    description:
      "Digital technologies are transforming modern power systems into intelligent and adaptive networks. Advanced analytics, big data, and AI-driven tools enable real-time monitoring and predictive decision-making. Smart meters, digital twins, and automation improve operational efficiency and reliability. Data-driven insights support better demand forecasting and system optimization. The transition toward fully digitalized grids is accelerating innovation.",
  },
  {
    title: "Bioenergy & Waste-to-Energy Technologies",
    description:
      "Sustainable energy production from biomass and waste offers significant environmental and economic benefits. Technologies such as biogas, biofuels, and waste conversion systems are gaining global importance. Efficient resource utilization and circular economy approaches are emphasized. Reducing landfill waste while generating clean energy is a key focus. Innovations aim to enhance efficiency and scalability.",
  },
  {
    title: "Thermal Energy Systems & Heat Management",
    description:
      "Efficient thermal energy utilization plays a vital role in industrial and residential applications. Innovations in solar thermal systems, heat exchangers, and waste heat recovery are explored. Advanced cooling and heating technologies contribute to energy conservation. Integration with renewable sources enhances overall system efficiency. Optimizing thermal processes supports sustainable energy use.",
  },
  {
    title: "Water-Energy Nexus",
    description:
      "Water and energy systems are closely interconnected, requiring integrated and sustainable solutions. Energy-efficient desalination, water treatment, and distribution technologies are gaining importance. Managing water resources alongside energy production enhances system sustainability. The nexus approach addresses resource scarcity and environmental challenges. Innovative strategies improve efficiency in both sectors.",
  },
  {
    title: "Advanced Energy Materials & Nanotechnology",
    description:
      "Material science is at the forefront of energy innovation and technological advancement. Development of nanomaterials and high-performance compounds enhances energy generation and storage. Improved efficiency, durability, and cost-effectiveness are key research goals. Applications span solar cells, batteries, and fuel cells. Cutting-edge materials enable next-generation energy systems.",
  },
  {
    title: "Power Electronics & Energy Conversion Systems",
    description:
      "Efficient energy conversion is essential for integrating renewable sources into modern grids. Advances in converters, inverters, and control systems improve performance and reliability. High-efficiency power electronics enable seamless energy transformation. Applications include renewable integration, electric vehicles, and smart grids. Innovation in this field supports overall system optimization.",
  },
  {
    title: "Industrial Decarbonization & Clean Manufacturing",
    description:
      "Industries are undergoing transformation toward low-carbon and sustainable production methods. Electrification, process optimization, and renewable integration reduce emissions. Adoption of cleaner technologies enhances efficiency and environmental performance. Industrial energy management systems play a crucial role. Achieving decarbonization targets requires innovation and collaboration.",
  },
  {
    title: "Future Fuels & Alternative Energy Carriers",
    description:
      "Emerging fuels are reshaping the global energy landscape beyond traditional fossil resources. Ammonia, synthetic fuels, and advanced hydrogen derivatives are gaining attention. Production, storage, and transportation challenges are key areas of research. These fuels offer potential for decarbonizing hard-to-abate sectors. Innovation is driving their large-scale adoption.",
  },
  {
    title: "Energy Forecasting & Predictive Modeling",
    description:
      "Accurate forecasting is critical for efficient energy planning and management. Advanced modeling techniques using AI and machine learning improve prediction accuracy. Applications include demand forecasting, renewable generation estimation, and system reliability. Data-driven approaches enhance operational decision-making. Predictive tools support resilient and efficient energy systems.",
  },
  {
    title: "Energy Access & Rural Electrification",
    description:
      "Access to reliable energy remains a global challenge, particularly in remote regions. Decentralized renewable systems such as microgrids provide sustainable solutions. Community-based energy models improve affordability and accessibility. Innovation in off-grid technologies supports rural development. Expanding energy access contributes to economic and social progress.",
  },
  {
    title: "Energy Policy, Governance & Global Cooperation",
    description:
      "Effective policies and governance frameworks are essential for accelerating energy transition. Regulatory mechanisms, international agreements, and collaborative initiatives shape global energy systems. Policy innovation supports investment and technology adoption. Cross-border cooperation enhances energy security and sustainability. Strategic governance drives long-term development.",
  },
  {
    title: "Sustainable Materials & Circular Economy",
    description:
      "Sustainable material use is critical for reducing environmental impact in energy systems. Recycling, reuse, and lifecycle management are key components of circular economy practices. Innovations focus on minimizing waste and improving resource efficiency. Materials used in energy technologies are being redesigned for sustainability. Long-term environmental benefits are emphasized.",
  },
  {
    title: "EV Infrastructure & Smart Charging Systems",
    description:
      "The growth of electric mobility requires advanced charging infrastructure and grid integration. Smart charging technologies enable efficient energy use and load management. Fast-charging systems and wireless solutions are evolving rapidly. Integration with renewable energy enhances sustainability. Infrastructure development is essential for large-scale EV adoption.",
  },
  {
    title: "Climate Technologies & Carbon Management",
    description:
      "Innovative climate technologies are essential for reducing emissions and managing carbon footprints. Carbon tracking, capture, and reduction strategies are key focus areas. Digital tools and analytics support climate monitoring and reporting. Solutions align with global net-zero targets and sustainability goals. Technology-driven approaches accelerate climate action.",
  },
  {
    title: "Urban Energy Systems & Smart Infrastructure",
    description:
      "Urban environments require integrated and efficient energy systems to support growing populations. Smart infrastructure combines renewable energy, digital systems, and intelligent planning. Energy-efficient buildings and urban grids improve sustainability. Data-driven solutions enhance city-level energy management. Future cities depend on innovative energy integration.",
  },
  {
    title: "Innovation, Startups & Energy Entrepreneurship",
    description:
      "Innovation ecosystems are driving rapid advancements in the energy sector. Startups and entrepreneurs are introducing disruptive technologies and business models. Collaboration between academia, industry, and investors is expanding. Commercialization of research plays a critical role in real-world impact. Entrepreneurial initiatives accelerate energy transformation.",
  },
  {
    title: "Energy Security & Resilience",
    description:
      "Reliable and secure energy systems are essential for economic stability and development. Resilient infrastructure ensures continuous energy supply under uncertainties. Risk management, diversification, and system flexibility are key focus areas. Renewable integration introduces new challenges and opportunities. Strengthening energy security remains a global priority.",
  },
  {
    title: "Space & Advanced Energy Concepts",
    description:
      "Exploration of futuristic energy technologies is opening new frontiers in energy research. Concepts such as space-based solar power and advanced energy systems are gaining attention. High-risk, high-reward innovations are encouraged in this track. Interdisciplinary research drives breakthroughs in this field. These ideas have the potential to redefine global energy systems.",
  },
];

const SessionsSection = () => {
  const [activeTrack, setActiveTrack] = useState<number | null>(null);
  const { getSection } = useWebsiteContent();
  const section = getSection("scientific_sessions", {
    title: "Sessions",
    content: tracks.map((track) => `${track.title} | ${track.description}`).join("\n"),
  });
  const parsedTracks = splitLines(section.content).map((line) => {
    const [title, ...descriptionParts] = line.split("|");
    return { title: title.trim(), description: descriptionParts.join("|").trim() };
  });
  const managedTracks = parsedTracks.length > 1 && parsedTracks.some((track) => track.description)
    ? parsedTracks
    : tracks;

  return (
    <section id="sessions" className="bg-background pt-16 pb-8">
      <div className="container mx-auto px-4">
        <div className="text-center mb-8">
          <p className="section-kicker mb-2">Scientific</p>
          <h2 className="text-3xl font-extrabold text-foreground md:text-4xl">{section.title}</h2>
        </div>

        <div className="max-w-5xl mx-auto space-y-3">
          {managedTracks.map((track, i) => {
            const isActive = activeTrack === i;

            return (
              <motion.div
                key={track.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.25, delay: i * 0.015 }}
                className={`rounded-md border bg-card transition-all ${
                  isActive ? "border-teal shadow-md shadow-teal/10" : "border-border hover:border-teal/45"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveTrack(isActive ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left transition-colors hover:bg-teal/5"
                >
                  <span>
                    <span className="font-bold text-teal">Track {i + 1}:</span>
                    <span className="ml-2 text-card-foreground">{track.title}</span>
                  </span>
                  <span className="text-xl font-bold leading-none text-teal">{isActive ? "-" : "+"}</span>
                </button>

                {isActive ? (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    transition={{ duration: 0.2 }}
                    className="border-t border-border px-5 py-4"
                  >
                    <p className="text-muted-foreground font-body leading-relaxed">{track.description}</p>
                  </motion.div>
                ) : null}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default SessionsSection;
