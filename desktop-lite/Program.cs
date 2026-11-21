using System;
using System.IO;
using System.Windows.Forms;

namespace Port79Lite {
 static class Program {
  [STAThread]
  static void Main() {
   Application.EnableVisualStyles();
   Application.SetCompatibleTextRenderingDefault(false);
   try {
    Application.Run(new MainForm());
   } catch (Exception ex) {
    try {
     var root = AppDomain.CurrentDomain.BaseDirectory;
     var log = Path.Combine(root,"local-data","logs");
     Directory.CreateDirectory(log);
     File.AppendAllText(Path.Combine(log,"errors.txt"),DateTime.Now.ToString("o")+" "+ex+"\r\n");
    }catch {}
    MessageBox.Show("Windows 程式啟動失敗，原本的雲端資料不會被修改。\n"+ex.Message,"79號碼頭系統",MessageBoxButtons.OK,MessageBoxIcon.Error);
   }
  }
 }
}
