export function SolutionSection() {
  const steps = [
    "Track shipments from loading to delivery.",
    "Manage clients, drivers, vehicles, and truck types.",
    "Record expenses like Gate Pass, Fashah, NAQL, fuel, tolls, and repairs.",
    "Monitor client payments, driver payments, pending balances, and profit.",
    "Generate invoice and report workflows from structured data."
  ];

  return (
    <section className="py-24 bg-white overflow-hidden">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="relative rounded-3xl bg-gradient-to-b from-[#1a2330] to-[#0e1116] px-6 py-16 sm:px-16 shadow-2xl overflow-hidden reveal">
          {/* Background Decorative Blob & Grid */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#6886a8] rounded-full blur-[120px] opacity-25 pointer-events-none" />

          <div className="relative z-10 lg:grid lg:grid-cols-2 lg:gap-16 items-center max-w-5xl mx-auto">
            
            <div className="mb-16 lg:mb-0 reveal pr-0 lg:pr-8 text-center lg:text-left">
              <h2 className="text-[32px] leading-[1.2] sm:text-[40px] font-[700] tracking-tight text-white mb-6">
                One workspace for daily transport operations.
              </h2>
              <p className="text-[17px] leading-relaxed text-[#a3c0dd] mb-8">
                Stop switching between different tools. TransportFlow brings your entire operation into a single, structured system designed specifically for logistics workflows.
              </p>
            </div>

            <div className="relative pl-6 lg:pl-12">
              {/* Timeline Line */}
              <div className="absolute left-[13px] lg:left-[35px] top-4 bottom-4 w-[2px] bg-gradient-to-b from-[#6886a8] via-[#6886a8]/30 to-transparent reveal origin-top" />
              
              <div className="space-y-8">
                {steps.map((step, index) => (
                  <div 
                    key={index} 
                    className="relative flex items-start gap-5 reveal"
                    style={{ transitionDelay: `${index * 150}ms` }}
                  >
                    <div className="absolute -left-[23px] lg:-left-[23px] flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#0e1116] border-[3px] border-[#6886a8] mt-0.5">
                      <div className="h-2 w-2 rounded-full bg-[#6886a8]" />
                    </div>
                    <div className="pl-6">
                      <p className="text-[15.5px] font-[500] leading-relaxed text-[#e3e8ef]">
                        {step}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
