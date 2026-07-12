import { useState } from "react";
import { UploadCloud } from "lucide-react";

export function MockUpload({ onUpload }: { onUpload: (name: string) => void }) {
  const [name, setName] = useState("new-bill-image.jpg");
  return (
    <div className="upload-box">
      <UploadCloud size={28} />
      <div>
        <strong>Drag and drop bill images here</strong>
        <p>Mock UI only. Choose a filename to create a local thumbnail placeholder.</p>
      </div>
      <input value={name} onChange={(event) => setName(event.target.value)} />
      <button className="btn-primary" onClick={() => onUpload(name || "bill-image.jpg")}>Add Thumbnail</button>
    </div>
  );
}
