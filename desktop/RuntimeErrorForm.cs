using System;
using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;

namespace IndustrialDigitalTwinSimulator
{
    /// <summary>
    /// Branded, readable failure dialog used when the WebView2 runtime is missing
    /// or the embedded browser cannot be initialized. Shown instead of an opaque
    /// crash so end users know exactly what to install.
    /// </summary>
    internal sealed class RuntimeErrorForm : Form
    {
        private const string FallbackTitle = "Industrial Digital Twin Simulator";
        private readonly string _downloadUrl;

        public RuntimeErrorForm(string headline, string detail, string downloadUrl, string appTitle = null)
        {
            _downloadUrl = downloadUrl;

            SuspendLayout();
            AutoScaleMode = AutoScaleMode.Dpi;
            Text = string.IsNullOrEmpty(appTitle) ? FallbackTitle : appTitle;
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ShowIcon = true;
            ShowInTaskbar = true;
            BackColor = Color.FromArgb(11, 18, 32);
            ForeColor = Color.FromArgb(226, 232, 240);
            ClientSize = new Size(660, 420);
            Icon = AppResources.LoadAppIcon();

            var accent = new Panel
            {
                Dock = DockStyle.Top,
                Height = 4,
                BackColor = Color.FromArgb(34, 211, 238)
            };
            Controls.Add(accent);

            var iconBox = new PictureBox
            {
                Location = new Point(30, 30),
                Size = new Size(64, 64),
                SizeMode = PictureBoxSizeMode.Zoom,
                BackColor = Color.Transparent
            };
            try
            {
                iconBox.Image = new Bitmap(Icon.ToBitmap(), new Size(64, 64));
            }
            catch (Exception)
            {
                iconBox.Image = null;
            }

            Controls.Add(iconBox);

            var headlineLabel = new Label
            {
                Location = new Point(114, 34),
                Size = new Size(514, 56),
                Font = new Font("Segoe UI", 15F, FontStyle.Bold, GraphicsUnit.Point),
                ForeColor = Color.FromArgb(224, 242, 254),
                Text = headline,
                AutoEllipsis = true
            };
            Controls.Add(headlineLabel);

            var detailLabel = new Label
            {
                Location = new Point(30, 118),
                Size = new Size(598, 210),
                Font = new Font("Segoe UI", 9.75F, FontStyle.Regular, GraphicsUnit.Point),
                ForeColor = Color.FromArgb(148, 163, 184),
                Text = detail,
                AutoSize = false,
                UseMnemonic = false
            };
            Controls.Add(detailLabel);

            var footer = new Label
            {
                Location = new Point(30, 344),
                Size = new Size(590, 22),
                Font = new Font("Segoe UI", 8.25F, FontStyle.Regular, GraphicsUnit.Point),
                ForeColor = Color.FromArgb(100, 116, 139),
                Text = "A log is written to: " + ShellLog.LogPath,
                AutoEllipsis = true,
                UseMnemonic = false
            };
            Controls.Add(footer);

            var exitButton = new Button
            {
                Text = "Exit",
                Size = new Size(96, 36),
                Location = new Point(ClientSize.Width - 30 - 96, 378),
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(22, 35, 58),
                ForeColor = Color.FromArgb(226, 232, 240),
                Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point),
                DialogResult = DialogResult.Cancel,
                UseVisualStyleBackColor = false
            };
            exitButton.FlatAppearance.BorderColor = Color.FromArgb(51, 65, 85);
            Controls.Add(exitButton);

            if (!string.IsNullOrEmpty(downloadUrl))
            {
                var downloadButton = new Button
                {
                    Text = "Download WebView2 Runtime",
                    Size = new Size(230, 36),
                    Location = new Point(exitButton.Left - 12 - 230, 378),
                    FlatStyle = FlatStyle.Flat,
                    BackColor = Color.FromArgb(14, 165, 233),
                    ForeColor = Color.FromArgb(4, 18, 31),
                    Font = new Font("Segoe UI", 9F, FontStyle.Bold, GraphicsUnit.Point),
                    UseVisualStyleBackColor = false
                };
                downloadButton.FlatAppearance.BorderSize = 0;
                downloadButton.Click += OnDownloadClick;
                Controls.Add(downloadButton);
                AcceptButton = downloadButton;
            }
            else
            {
                AcceptButton = exitButton;
            }

            CancelButton = exitButton;
            ResumeLayout(false);
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            TitleBarTheme.ApplyDark(this);
        }

        private void OnDownloadClick(object sender, EventArgs e)
        {
            try
            {
                Process.Start(new ProcessStartInfo(_downloadUrl) { UseShellExecute = true });
                ShellLog.Info("Opened WebView2 runtime download page.");
            }
            catch (Exception ex)
            {
                ShellLog.Error("Unable to open the WebView2 download page.", ex);
                MessageBox.Show(
                    "Unable to open the download page automatically." + Environment.NewLine + Environment.NewLine +
                    "Please visit: " + _downloadUrl,
                    Text,
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
            }
        }
    }
}
