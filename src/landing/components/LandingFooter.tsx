export function LandingFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-[#e3e8ef] bg-white">
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2.5 text-[14px] font-[600] tracking-tight text-[#0e1116]">
            Developed by <a href="https://www.inboxecommerce.com" target="_blank" rel="noopener noreferrer" className="text-[#6886a8] hover:underline">Inbox E-commerce</a>
          </div>
          
          <nav className="flex flex-wrap justify-center gap-x-8 gap-y-4 text-[13px] font-medium text-[#4d5663]">
            <a href="#problems" className="hover:text-[#0e1116] transition-colors">Problems</a>
            <a href="#features" className="hover:text-[#0e1116] transition-colors">Features</a>
            <a href="#workflow" className="hover:text-[#0e1116] transition-colors">Workflow</a>
            <a href="#faq" className="hover:text-[#0e1116] transition-colors">FAQ</a>
            <a href="/app/" className="hover:text-[#0e1116] transition-colors">Login</a>
          </nav>

          <p className="text-[12.5px] font-medium text-[#8993a3]">
            &copy; {currentYear} TransportFlow. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
